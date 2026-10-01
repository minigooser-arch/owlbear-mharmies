import { appendLRTransaction } from "../finance/lrLedger";
import { debitHumanResource } from "../finance/humanResourceLedger";
import type { ArmyState, SceneState } from "../shared/types";
import { hasActiveCityBuilding } from "../cities/cityEffects";

const DEFAULT_FORMATION_HP_PER_TURN = 20;
const BARRACKS_FORMATION_HP_PER_TURN = 35;

function formationRateInSceneUnits(scene: SceneState, sideId: string, configuredRate: number): number {
  const side = scene.sides.find((candidate) => candidate.id === sideId);
  const demography = side?.stateId
    ? scene.demographics?.find((record) => record.stateId === side.stateId)
    : undefined;
  if (demography && configuredRate >= 1000 && demography.humanResource <= demography.humanResourceCapacity) {
    return configuredRate / 1000;
  }
  return configuredRate;
}

export function applyAutomaticArmyFormation(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>>,
  turnNumber: number,
  at: string
): Record<string, ArmyState> {
  const nextArmies = structuredClone(armies) as Record<string, ArmyState>;
  const configuredRate = scene.settings.armyFormationCostPerHp ?? 10000;

  for (const [armyId, army] of Object.entries(nextArmies)) {
    if (!army.formation?.active || army.status === "IN_BATTLE") continue;
    const city = army.formation.cityId
      ? (scene.strategicCities ?? []).find((candidate) => candidate.id === army.formation?.cityId)
      : undefined;
    const hasBarracks = city
      ? hasActiveCityBuilding(scene, city.id, "BARRACKS")
      : false;
    const turnCap = hasBarracks
      ? BARRACKS_FORMATION_HP_PER_TURN
      : DEFAULT_FORMATION_HP_PER_TURN;
    const alreadyAdded = army.formation.checkedOnTurn === turnNumber ? army.formation.hpAddedThisTurn : 0;
    const allowed = Math.min(turnCap - alreadyAdded, army.health.maxHp - army.health.hp);
    if (allowed <= 0) continue;

    const side = scene.sides.find((candidate) => candidate.id === army.sideId);
    const demography = side?.stateId
      ? scene.demographics?.find((record) => record.stateId === side.stateId)
      : undefined;
    const rate = formationRateInSceneUnits(scene, army.sideId, configuredRate);
    const affordable = demography ? Math.floor(Math.max(0, demography.humanResource) / rate) : allowed;
    const hp = Math.min(allowed, affordable);
    if (hp <= 0) {
      nextArmies[armyId] = {
        ...army,
        formation: { ...army.formation, hpAddedThisTurn: 0, checkedOnTurn: turnNumber }
      };
      continue;
    }

    if (demography) {
      const debit = debitHumanResource(scene, army.sideId, hp * rate, {
        requestId: `auto-formation-${turnNumber}-${armyId}`,
        actorPlayerId: "SYSTEM",
        kind: army.health.hp + hp >= army.health.maxHp ? "COMPLETION" : "FORMATION",
        armyId,
        armyName: armyId,
        cityId: city?.id ?? null,
        cityName: city?.name ?? null,
        hp,
        ratePerHp: rate,
        turnNumber,
        createdAt: at
      });
      if (!debit.ok) continue;
      scene.demographics = (scene.demographics ?? []).map((record) =>
        record.stateId === debit.demography.stateId ? debit.demography : record
      );
      scene.lrTransactions = appendLRTransaction(scene.lrTransactions ?? [], debit.transaction);
    }

    const nextHp = army.health.hp + hp;
    const active = nextHp < army.health.maxHp;
    nextArmies[armyId] = {
      ...army,
      health: { ...army.health, hp: nextHp },
      movement: { ...army.movement, remainingUnits: active ? 0 : army.movement.maxUnits },
      formation: { active, cityId: army.formation.cityId, hpAddedThisTurn: hp, checkedOnTurn: turnNumber },
      revision: army.revision + 1
    };
  }
  return nextArmies;
}

