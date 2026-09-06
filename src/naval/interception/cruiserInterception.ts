import type {
  GridCellCoord,
  NavalBattleState,
  NavalInterceptionState,
  ShipState
} from "../../shared/types";
import { isInNormalBroadsideMask } from "../battle/broadsideMask";
import { endNavalShipTurn, useNavalAction } from "../battle/navalRoundFlow";
import { applyShipDamage } from "../ships/shipDamage";
import { SHIP_CLASSES } from "../ships/shipClasses";

export type CruiserInterceptionFailure =
  | "BATTLE_NOT_ACTIVE"
  | "SHIP_NOT_PARTICIPANT"
  | "SHIP_NOT_ACTIVE"
  | "SHIP_DESTROYED"
  | "SHIP_EXITED"
  | "ACTION_ALREADY_USED"
  | "SHIP_NOT_CRUISER";

export interface ActivateCruiserInterceptionInput {
  battle: NavalBattleState;
  cruiserId: string;
  cruiser: ShipState;
  ships: Readonly<Record<string, ShipState>>;
}

export type ActivateCruiserInterceptionResult =
  | { ok: true; battle: NavalBattleState }
  | { ok: false; reason: CruiserInterceptionFailure };

export function activateCruiserInterception(
  input: ActivateCruiserInterceptionInput
): ActivateCruiserInterceptionResult {
  if (input.battle.status !== "ACTIVE") return { ok: false, reason: "BATTLE_NOT_ACTIVE" };
  if (!input.battle.participantShipIds.includes(input.cruiserId)) {
    return { ok: false, reason: "SHIP_NOT_PARTICIPANT" };
  }
  if (input.battle.currentShipId !== input.cruiserId) return { ok: false, reason: "SHIP_NOT_ACTIVE" };
  if (input.cruiser.hp <= 0) return { ok: false, reason: "SHIP_DESTROYED" };
  if (input.battle.exitedShipIds.includes(input.cruiserId)) return { ok: false, reason: "SHIP_EXITED" };
  if (input.battle.actionUsedByShip[input.cruiserId]) return { ok: false, reason: "ACTION_ALREADY_USED" };
  if (input.cruiser.classId !== "CRUISER") return { ok: false, reason: "SHIP_NOT_CRUISER" };

  const battle = useNavalAction(input.battle, input.ships, input.cruiserId);
  battle.movementRemainingByShip[input.cruiserId] = 0;
  battle.interceptions = {
    ...(battle.interceptions ?? {}),
    [input.cruiserId]: {
      cruiserShipId: input.cruiserId,
      activatedRoundNumber: input.battle.roundNumber
    }
  };
  return { ok: true, battle };
}

export interface CruiserInterceptionZoneCellInput {
  cruiser: ShipState;
  cruiserCell: GridCellCoord;
  candidateCell: GridCellCoord;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
}

export function isCruiserInterceptionZoneCell(input: CruiserInterceptionZoneCellInput): boolean {
  if (input.cruiser.classId !== "CRUISER" || input.cruiser.hp <= 0) return false;
  return isInNormalBroadsideMask(
    "CRUISER",
    input.cruiser.facing,
    input.cruiserCell,
    input.candidateCell
  ) && input.hasLineOfSight(input.cruiserCell, input.candidateCell);
}

export interface ShouldTriggerCruiserInterceptionInput {
  battle: NavalBattleState;
  ships: Readonly<Record<string, ShipState>>;
  cruiserId: string;
  movingShipId: string;
  cruiserCell: GridCellCoord;
  sourceCell: GridCellCoord;
  destinationCell: GridCellCoord;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
}

export function shouldTriggerCruiserInterception(
  input: ShouldTriggerCruiserInterceptionInput
): boolean {
  const interception = input.battle.interceptions?.[input.cruiserId];
  if (!interception) return false;
  if (input.cruiserId === input.movingShipId) return false;
  if (!input.battle.participantShipIds.includes(input.cruiserId)) return false;
  if (!input.battle.participantShipIds.includes(input.movingShipId)) return false;
  if (input.battle.exitedShipIds.includes(input.cruiserId)) return false;
  if (input.battle.exitedShipIds.includes(input.movingShipId)) return false;

  const cruiser = input.ships[input.cruiserId];
  const movingShip = input.ships[input.movingShipId];
  if (!cruiser || !movingShip || cruiser.hp <= 0 || movingShip.hp <= 0) return false;
  if (cruiser.sideId === movingShip.sideId) return false;

  const sourceInside = isCruiserInterceptionZoneCell({
    cruiser,
    cruiserCell: input.cruiserCell,
    candidateCell: input.sourceCell,
    hasLineOfSight: input.hasLineOfSight
  });
  if (sourceInside) return false;

  return isCruiserInterceptionZoneCell({
    cruiser,
    cruiserCell: input.cruiserCell,
    candidateCell: input.destinationCell,
    hasLineOfSight: input.hasLineOfSight
  });
}

export interface CruiserInterceptionTriggerResult {
  cruiserShipId: string;
  rolledDamage: number;
  armor: number;
  damage: number;
}

export interface ResolveCruiserInterceptionsForStepInput {
  battle: NavalBattleState;
  ships: Readonly<Record<string, ShipState>>;
  movingShipId: string;
  sourceCell: GridCellCoord;
  destinationCell: GridCellCoord;
  shipCells: Readonly<Record<string, GridCellCoord>>;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
  rollD6(): number;
}

export interface ResolveCruiserInterceptionsForStepResult {
  battle: NavalBattleState;
  ships: Record<string, ShipState>;
  triggered: CruiserInterceptionTriggerResult[];
}

export function resolveCruiserInterceptionsForStep(
  input: ResolveCruiserInterceptionsForStepInput
): ResolveCruiserInterceptionsForStepResult {
  const movingShip = input.ships[input.movingShipId];
  if (!movingShip || movingShip.hp <= 0) {
    return {
      battle: input.battle,
      ships: { ...input.ships },
      triggered: []
    };
  }

  const activeCruiserIds = input.battle.initiative
    .map((entry) => entry.shipId)
    .filter((shipId) => input.battle.interceptions?.[shipId] !== undefined);
  const matchingCruiserIds = activeCruiserIds.filter((cruiserId) => {
    const cruiserCell = input.shipCells[cruiserId];
    if (!cruiserCell) return false;
    return shouldTriggerCruiserInterception({
      battle: input.battle,
      ships: input.ships,
      cruiserId,
      movingShipId: input.movingShipId,
      cruiserCell,
      sourceCell: input.sourceCell,
      destinationCell: input.destinationCell,
      hasLineOfSight: input.hasLineOfSight
    });
  });

  if (matchingCruiserIds.length === 0) {
    return {
      battle: input.battle,
      ships: { ...input.ships },
      triggered: []
    };
  }

  const ships: Record<string, ShipState> = { ...input.ships };
  const triggered: CruiserInterceptionTriggerResult[] = [];

  for (const cruiserId of matchingCruiserIds) {
    const currentTarget = ships[input.movingShipId];
    if (!currentTarget) continue;
    const rolledDamage = input.rollD6() + input.rollD6();
    const armor = SHIP_CLASSES[currentTarget.classId].armor;
    const damage = Math.max(0, rolledDamage - armor);
    ships[input.movingShipId] = applyShipDamage(currentTarget, damage);
    triggered.push({
      cruiserShipId: cruiserId,
      rolledDamage,
      armor,
      damage
    });
  }

  const prepared = structuredClone(input.battle);
  const triggeredIds = new Set(matchingCruiserIds);
  prepared.interceptions = Object.fromEntries(
    Object.entries(prepared.interceptions ?? {})
      .filter(([cruiserId]) => !triggeredIds.has(cruiserId))
  );
  prepared.movementRemainingByShip[input.movingShipId] = 0;
  prepared.actionUsedByShip[input.movingShipId] = true;

  return {
    battle: endNavalShipTurn(prepared, ships, input.movingShipId),
    ships,
    triggered
  };
}

export function removeCruiserInterceptionAfterDamage(
  battle: NavalBattleState,
  cruiserId: string,
  actualHpLost: number
): NavalBattleState {
  if (actualHpLost <= 0 || !battle.interceptions?.[cruiserId]) return battle;
  const next = structuredClone(battle);
  const interceptions: Record<string, NavalInterceptionState> = Object.fromEntries(
    Object.entries(next.interceptions ?? {}).filter(([shipId]) => shipId !== cruiserId)
  );
  next.interceptions = interceptions;
  next.revision += 1;
  return next;
}
