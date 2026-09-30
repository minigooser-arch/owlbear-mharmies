import type {
  ArmyState,
  ArmyUpgradeBranch,
  ArmyUpgrades,
  ShipState,
  UpgradeLevel,
  UpgradeTrack,
  UpgradeVariant
} from "../shared/types";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";

export const UPGRADE_COST: Readonly<Record<UpgradeLevel, number>> = Object.freeze({
  1: 1,
  2: 2,
  3: 3
});

export function emptyUpgradeTrack(): UpgradeTrack {
  return {};
}

export function emptyArmyUpgrades(): ArmyUpgrades {
  return {
    recovery: {},
    motorization: {},
    reconnaissance: {}
  };
}

function trackChoice(track: UpgradeTrack | undefined, level: UpgradeLevel): UpgradeVariant | undefined {
  if (!track) return undefined;
  if (level === 1) return track.level1;
  if (level === 2) return track.level2;
  return track.level3;
}

function setTrackChoice(track: UpgradeTrack | undefined, level: UpgradeLevel, variant: UpgradeVariant): UpgradeTrack {
  const next: UpgradeTrack = { ...(track ?? {}) };
  if (level === 1) next.level1 = variant;
  else if (level === 2) next.level2 = variant;
  else next.level3 = variant;
  return next;
}

export function hasTrackUpgrade(
  track: UpgradeTrack | undefined,
  level: UpgradeLevel,
  variant?: UpgradeVariant
): boolean {
  const selected = trackChoice(track, level);
  return selected !== undefined && (variant === undefined || selected === variant);
}

function armyTrack(army: Pick<ArmyState, "upgrades">, branch: ArmyUpgradeBranch): UpgradeTrack | undefined {
  return army.upgrades?.[branch];
}

export function hasArmyUpgrade(
  army: Pick<ArmyState, "upgrades">,
  branch: ArmyUpgradeBranch,
  level: UpgradeLevel,
  variant?: UpgradeVariant
): boolean {
  return hasTrackUpgrade(armyTrack(army, branch), level, variant);
}

export function hasShipUpgrade(
  ship: Pick<ShipState, "upgrades">,
  level: UpgradeLevel,
  variant?: UpgradeVariant
): boolean {
  return hasTrackUpgrade(ship.upgrades, level, variant);
}

export type UpgradePurchaseFailure =
  | "UPGRADE_ALREADY_PURCHASED"
  | "UPGRADE_PREREQUISITE_REQUIRED"
  | "ARMY_THIRD_LEVEL_ALREADY_SELECTED"
  | "INSUFFICIENT_EXPERIENCE";

export type ArmyUpgradePurchaseResult =
  | { ok: true; army: ArmyState }
  | { ok: false; reason: UpgradePurchaseFailure };

export function purchaseArmyUpgrade(
  army: ArmyState,
  branch: ArmyUpgradeBranch,
  level: UpgradeLevel,
  variant: UpgradeVariant
): ArmyUpgradePurchaseResult {
  const track = armyTrack(army, branch);
  if (trackChoice(track, level)) return { ok: false, reason: "UPGRADE_ALREADY_PURCHASED" };
  if (level >= 2 && !trackChoice(track, (level - 1) as UpgradeLevel)) {
    return { ok: false, reason: "UPGRADE_PREREQUISITE_REQUIRED" };
  }
  if (level === 3) {
    const branches: ArmyUpgradeBranch[] = ["recovery", "motorization", "reconnaissance"];
    if (branches.some((candidate) => trackChoice(armyTrack(army, candidate), 3))) {
      return { ok: false, reason: "ARMY_THIRD_LEVEL_ALREADY_SELECTED" };
    }
  }
  const cost = UPGRADE_COST[level];
  const experience = army.experience ?? 0;
  if (experience < cost) return { ok: false, reason: "INSUFFICIENT_EXPERIENCE" };

  const upgrades = { ...(army.upgrades ?? emptyArmyUpgrades()) };
  upgrades[branch] = setTrackChoice(track, level, variant);
  const nextMaxHp = armyEffectiveMaxHp({ ...army, upgrades });
  return {
    ok: true,
    army: {
      ...army,
      experience: experience - cost,
      upgrades,
      health: {
        hp: Math.min(army.health.hp, nextMaxHp),
        maxHp: nextMaxHp
      },
      revision: army.revision + 1
    }
  };
}

export type ShipUpgradePurchaseResult =
  | { ok: true; ship: ShipState }
  | { ok: false; reason: Exclude<UpgradePurchaseFailure, "ARMY_THIRD_LEVEL_ALREADY_SELECTED"> };

export function purchaseShipUpgrade(
  ship: ShipState,
  level: UpgradeLevel,
  variant: UpgradeVariant
): ShipUpgradePurchaseResult {
  if (trackChoice(ship.upgrades, level)) return { ok: false, reason: "UPGRADE_ALREADY_PURCHASED" };
  if (level >= 2 && !trackChoice(ship.upgrades, (level - 1) as UpgradeLevel)) {
    return { ok: false, reason: "UPGRADE_PREREQUISITE_REQUIRED" };
  }
  const cost = UPGRADE_COST[level];
  const experience = ship.experience ?? 0;
  if (experience < cost) return { ok: false, reason: "INSUFFICIENT_EXPERIENCE" };
  const upgrades = setTrackChoice(ship.upgrades, level, variant);
  const maxHp = shipEffectiveMaxHp({ ...ship, upgrades });
  return {
    ok: true,
    ship: {
      ...ship,
      experience: experience - cost,
      upgrades,
      hp: Math.min(ship.hp, maxHp),
      revision: ship.revision + 1
    }
  };
}

export function armyEffectiveMaxHp(army: Pick<ArmyState, "upgrades">): number {
  let value = 40;
  if (hasArmyUpgrade(army, "recovery", 1, "A")) value += 5;
  if (hasArmyUpgrade(army, "recovery", 3, "A")) value += 10;
  return value;
}

export function armyEffectiveMovementUnits(army: Pick<ArmyState, "upgrades">): number {
  let units = 10;
  if (hasArmyUpgrade(army, "motorization", 1, "A")) units += 2;
  if (hasArmyUpgrade(army, "motorization", 2, "A")) units += 2;
  if (hasArmyUpgrade(army, "motorization", 3, "A")) units += 4;
  return units;
}

const ROUGH_TERRAIN = new Set(["mountains", "hills", "forest_hills", "swamp"]);

export function armyTerrainMovementCostUnits(
  army: Pick<ArmyState, "upgrades">,
  terrainId: string,
  baseUnits: number
): number {
  let units = baseUnits;
  if (hasArmyUpgrade(army, "motorization", 1, "B") && ROUGH_TERRAIN.has(terrainId)) units -= 1;
  if (hasArmyUpgrade(army, "motorization", 2, "B") && baseUnits > 2) units -= 1;
  if (hasArmyUpgrade(army, "motorization", 3, "B")) units -= 2;
  return Math.max(1, units);
}

export function armyEffectiveDetectionRange(
  army: Pick<ArmyState, "upgrades">,
  baseRange: number
): number {
  let range = baseRange;
  if (hasArmyUpgrade(army, "reconnaissance", 1, "A")) range += 1;
  if (hasArmyUpgrade(army, "reconnaissance", 2, "A")) range += 1;
  if (hasArmyUpgrade(army, "reconnaissance", 3, "A")) range += 2;
  return Math.max(0, range);
}

export function armyConcealmentCells(army: Pick<ArmyState, "upgrades">): number {
  let concealment = 0;
  if (hasArmyUpgrade(army, "reconnaissance", 1, "B")) concealment += 1;
  if (hasArmyUpgrade(army, "reconnaissance", 3, "B")) concealment += 2;
  return concealment;
}

export function armyRevealsEnemyHp(army: Pick<ArmyState, "upgrades">): boolean {
  return hasArmyUpgrade(army, "reconnaissance", 2, "B");
}

export type ArmyRecoveryLocation = "FIELD" | "CITY_OR_ROAD" | "HOSPITAL";

export function armyRecoveryHpCap(
  army: Pick<ArmyState, "upgrades">,
  location: ArmyRecoveryLocation
): number {
  let amount = location === "FIELD" ? 5 : location === "CITY_OR_ROAD" ? 10 : 15;
  if (hasArmyUpgrade(army, "recovery", 1, "B")) amount += 2;
  if (hasArmyUpgrade(army, "recovery", 2, "A") && location === "FIELD") amount += 5;
  if (hasArmyUpgrade(army, "recovery", 2, "B") && location !== "FIELD") amount += 5;
  if (hasArmyUpgrade(army, "recovery", 3, "B")) amount = Math.floor(amount * 1.5);
  return amount;
}

export function shipEffectiveMaxHp(ship: Pick<ShipState, "classId" | "upgrades">): number {
  let value = SHIP_CLASSES[ship.classId].maxHp;
  if (ship.classId === "BATTLESHIP" && hasShipUpgrade(ship, 1, "A")) value += 5;
  if (ship.classId === "CRUISER" && hasShipUpgrade(ship, 2, "A")) value += 5;
  if (ship.classId === "IRONCLAD" && hasShipUpgrade(ship, 1, "A")) value += 5;
  if (ship.classId === "HOSPITAL" && hasShipUpgrade(ship, 1, "A")) value += 5;
  if (ship.classId === "TRANSPORT" && hasShipUpgrade(ship, 1, "A")) value += 5;
  return value;
}

export function shipEffectiveArmor(ship: Pick<ShipState, "classId" | "upgrades">): number {
  let armor = SHIP_CLASSES[ship.classId].armor;
  if (ship.classId === "BATTLESHIP" && hasShipUpgrade(ship, 2, "A")) armor += 1;
  if (ship.classId === "CRUISER" && hasShipUpgrade(ship, 2, "B")) armor += 1;
  if (ship.classId === "IRONCLAD" && hasShipUpgrade(ship, 2, "A")) armor += 1;
  if (ship.classId === "IRONCLAD" && hasShipUpgrade(ship, 3, "A")) armor += 1;
  if (ship.classId === "HOSPITAL" && hasShipUpgrade(ship, 2, "A")) armor += 1;
  if (ship.classId === "TRANSPORT" && hasShipUpgrade(ship, 2, "A")) armor += 1;
  return armor;
}

export function shipEffectiveMovement(ship: Pick<ShipState, "classId" | "upgrades">): number {
  let movement = SHIP_CLASSES[ship.classId].movement;
  if (ship.classId === "BATTLESHIP" && hasShipUpgrade(ship, 1, "B")) movement += 1;
  if (ship.classId === "CRUISER" && hasShipUpgrade(ship, 1, "A")) movement += 1;
  if (ship.classId === "CRUISER" && hasShipUpgrade(ship, 3, "B")) movement += 2;
  if (ship.classId === "IRONCLAD" && hasShipUpgrade(ship, 1, "B")) movement += 1;
  if (ship.classId === "HOSPITAL" && hasShipUpgrade(ship, 1, "B")) movement += 1;
  if (ship.classId === "TRANSPORT" && hasShipUpgrade(ship, 1, "B")) movement += 1;
  return movement;
}

function shipAttackDiceBonus(ship: Pick<ShipState, "classId" | "upgrades">): number {
  let bonus = 0;
  if ((ship.classId === "BATTLESHIP" || ship.classId === "CRUISER") && hasShipUpgrade(ship, 3, "A")) bonus += 1;
  if (ship.classId === "IRONCLAD" && hasShipUpgrade(ship, 2, "B")) bonus += 1;
  if (ship.classId === "IRONCLAD" && hasShipUpgrade(ship, 3, "B")) bonus += 1;
  return bonus;
}

export function shipEffectiveAttackDice(
  ship: Pick<ShipState, "classId" | "upgrades">,
  ironcladCloseRangeSpecial = false
): number {
  const base = ironcladCloseRangeSpecial && ship.classId === "IRONCLAD"
    ? 3
    : SHIP_CLASSES[ship.classId].normalDice;
  return base + shipAttackDiceBonus(ship);
}

export function shipEffectiveRangeMax(ship: Pick<ShipState, "classId" | "upgrades">): number {
  let range = SHIP_CLASSES[ship.classId].normalRangeMax;
  if (ship.classId === "BATTLESHIP" && hasShipUpgrade(ship, 3, "B")) range += 1;
  return range;
}

export function shipDetectionBonus(ship: Pick<ShipState, "classId" | "upgrades">): number {
  if (ship.classId === "BATTLESHIP" && hasShipUpgrade(ship, 2, "B")) return 1;
  if (ship.classId === "CRUISER" && hasShipUpgrade(ship, 1, "B")) return 1;
  if (ship.classId === "TRANSPORT" && hasShipUpgrade(ship, 2, "B")) return 1;
  return 0;
}

export function hospitalSupportDice(ship: Pick<ShipState, "classId" | "upgrades">): number {
  if (ship.classId !== "HOSPITAL") return 0;
  let dice = 2;
  if (hasShipUpgrade(ship, 2, "B")) dice += 1;
  if (hasShipUpgrade(ship, 3, "A")) dice += 1;
  return dice;
}

export function hospitalSupportRange(ship: Pick<ShipState, "classId" | "upgrades">): number {
  return ship.classId === "HOSPITAL" && hasShipUpgrade(ship, 3, "B") ? 2 : 1;
}

export function transportCapacity(ship: Pick<ShipState, "classId" | "upgrades">): number {
  return ship.classId === "TRANSPORT" && hasShipUpgrade(ship, 3, "A") ? 2 : 1;
}

export function transportLoadingIsFree(ship: Pick<ShipState, "classId" | "upgrades">): boolean {
  return ship.classId === "TRANSPORT" && hasShipUpgrade(ship, 3, "B");
}
