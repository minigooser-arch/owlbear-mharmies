import type {
  GridCellCoord,
  NavalBattleState,
  ShipState
} from "../../shared/types";
import { applyShipDamage } from "../ships/shipDamage";
import { SHIP_CLASSES } from "../ships/shipClasses";
import { isInIroncladAdjacentSpecialMask, isInNormalBroadsideMask } from "./broadsideMask";
import { useNavalAction } from "./navalRoundFlow";

export interface BroadsideSectorInput {
  attackerCell: GridCellCoord;
  targetCell: GridCellCoord;
  facing: ShipState["facing"];
}

export type BroadsideSectorResolver = (input: BroadsideSectorInput) => boolean;

export type BroadsideTargetFailure =
  | "SHIP_NOT_ACTIVE"
  | "SHIP_DESTROYED"
  | "ACTION_ALREADY_USED"
  | "SHIP_UNARMED"
  | "TARGET_EXITED"
  | "TARGET_DESTROYED"
  | "FRIENDLY_TARGET"
  | "OUTSIDE_BROADSIDE_SECTOR"
  | "OUT_OF_RANGE"
  | "NO_NAVAL_LOS";

export type BroadsideTargetValidation =
  | { ok: true; range: number }
  | { ok: false; reason: BroadsideTargetFailure; range?: number };

export interface ValidateBroadsideTargetInput {
  battle: NavalBattleState;
  attackerId: string;
  targetId: string;
  attacker: ShipState;
  target: ShipState;
  attackerCell: GridCellCoord;
  targetCell: GridCellCoord;
  sectorResolver?: BroadsideSectorResolver;
  distanceCells(from: GridCellCoord, to: GridCellCoord): number;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
}

function targetInBroadsideSector(input: ValidateBroadsideTargetInput): boolean {
  if (input.sectorResolver) {
    return input.sectorResolver({
      attackerCell: input.attackerCell,
      targetCell: input.targetCell,
      facing: input.attacker.facing
    });
  }
  return isInNormalBroadsideMask(
    input.attacker.classId,
    input.attacker.facing,
    input.attackerCell,
    input.targetCell
  );
}

export function validateBroadsideTarget(
  input: ValidateBroadsideTargetInput
): BroadsideTargetValidation {
  if (input.battle.currentShipId !== input.attackerId) {
    return { ok: false, reason: "SHIP_NOT_ACTIVE" };
  }
  if (input.attacker.hp <= 0) {
    return { ok: false, reason: "SHIP_DESTROYED" };
  }
  if (input.battle.actionUsedByShip[input.attackerId]) {
    return { ok: false, reason: "ACTION_ALREADY_USED" };
  }

  const weapon = SHIP_CLASSES[input.attacker.classId];
  if (weapon.normalDice <= 0 || weapon.normalRangeMax <= 0) {
    return { ok: false, reason: "SHIP_UNARMED" };
  }
  if (input.battle.exitedShipIds.includes(input.targetId)) {
    return { ok: false, reason: "TARGET_EXITED" };
  }
  if (input.target.hp <= 0) {
    return { ok: false, reason: "TARGET_DESTROYED" };
  }
  if (input.attacker.sideId === input.target.sideId) {
    return { ok: false, reason: "FRIENDLY_TARGET" };
  }
  if (!targetInBroadsideSector(input)) {
    return { ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" };
  }

  const range = input.distanceCells(input.attackerCell, input.targetCell);
  if (range < weapon.normalRangeMin || range > weapon.normalRangeMax) {
    return { ok: false, reason: "OUT_OF_RANGE", range };
  }
  if (!input.hasLineOfSight(input.attackerCell, input.targetCell)) {
    return { ok: false, reason: "NO_NAVAL_LOS" };
  }

  return { ok: true, range };
}

export interface CommitBroadsideActionInput {
  battle: NavalBattleState;
  ships: Readonly<Record<string, ShipState>>;
  attackerId: string;
  targetId: string;
  attackerCell: GridCellCoord;
  targetCell: GridCellCoord;
  sectorResolver?: BroadsideSectorResolver;
  distanceCells(from: GridCellCoord, to: GridCellCoord): number;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
}

export type CommitBroadsideActionResult =
  | { ok: true; range: number; battle: NavalBattleState }
  | { ok: false; reason: BroadsideTargetFailure; range?: number };

export function commitBroadsideAction(
  input: CommitBroadsideActionInput
): CommitBroadsideActionResult {
  const attacker = input.ships[input.attackerId];
  const target = input.ships[input.targetId];
  if (!attacker) return { ok: false, reason: "SHIP_NOT_ACTIVE" };
  if (!target) return { ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" };

  const validation = validateBroadsideTarget({
    battle: input.battle,
    attackerId: input.attackerId,
    targetId: input.targetId,
    attacker,
    target,
    attackerCell: input.attackerCell,
    targetCell: input.targetCell,
    ...(input.sectorResolver ? { sectorResolver: input.sectorResolver } : {}),
    distanceCells: input.distanceCells,
    hasLineOfSight: input.hasLineOfSight
  });
  if (!validation.ok) return validation;

  return {
    ok: true,
    range: validation.range,
    battle: useNavalAction(input.battle, input.ships, input.attackerId)
  };
}

export interface CommitBroadsideAttackInput extends CommitBroadsideActionInput {
  rollD6(): number;
}

export type CommitBroadsideAttackResult =
  | {
      ok: true;
      range: number;
      rolledDamage: number;
      armor: number;
      damage: number;
      special: boolean;
      target: ShipState;
      battle: NavalBattleState;
    }
  | { ok: false; reason: BroadsideTargetFailure; range?: number };

export function commitBroadsideAttack(
  input: CommitBroadsideAttackInput
): CommitBroadsideAttackResult {
  const attacker = input.ships[input.attackerId];
  const target = input.ships[input.targetId];
  if (!attacker) return { ok: false, reason: "SHIP_NOT_ACTIVE" };
  if (!target) return { ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" };

  const validation = validateBroadsideTarget({
    battle: input.battle,
    attackerId: input.attackerId,
    targetId: input.targetId,
    attacker,
    target,
    attackerCell: input.attackerCell,
    targetCell: input.targetCell,
    ...(input.sectorResolver ? { sectorResolver: input.sectorResolver } : {}),
    distanceCells: input.distanceCells,
    hasLineOfSight: input.hasLineOfSight
  });
  if (!validation.ok) return validation;

  const special =
    attacker.classId === "IRONCLAD" &&
    isInIroncladAdjacentSpecialMask(
      attacker.facing,
      input.attackerCell,
      input.targetCell
    );
  const dice = special ? 3 : SHIP_CLASSES[attacker.classId].normalDice;
  let rolledDamage = 0;
  for (let index = 0; index < dice; index += 1) rolledDamage += input.rollD6();

  const armor = special ? 0 : SHIP_CLASSES[target.classId].armor;
  const damage = Math.max(0, rolledDamage - armor);
  const updatedTarget = applyShipDamage(target, damage);
  const updatedShips = {
    ...input.ships,
    [input.targetId]: updatedTarget
  };

  return {
    ok: true,
    range: validation.range,
    rolledDamage,
    armor,
    damage,
    special,
    target: updatedTarget,
    battle: useNavalAction(input.battle, updatedShips, input.attackerId)
  };
}
