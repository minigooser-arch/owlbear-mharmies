import type {
  GridCellCoord,
  NavalBattleState,
  ShipState
} from "../../shared/types";
import { SHIP_CLASSES } from "../ships/shipClasses";
import { useNavalAction } from "./navalRoundFlow";

export interface BroadsideSectorInput {
  attackerCell: GridCellCoord;
  targetCell: GridCellCoord;
  facing: ShipState["facing"];
}

export type BroadsideSectorResolver = (input: BroadsideSectorInput) => boolean;

export type BroadsideTargetFailure =
  | "SHIP_NOT_ACTIVE"
  | "ACTION_ALREADY_USED"
  | "SHIP_UNARMED"
  | "TARGET_EXITED"
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
  sectorResolver: BroadsideSectorResolver;
  distanceCells(from: GridCellCoord, to: GridCellCoord): number;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
}

export function validateBroadsideTarget(
  input: ValidateBroadsideTargetInput
): BroadsideTargetValidation {
  if (input.battle.currentShipId !== input.attackerId) {
    return { ok: false, reason: "SHIP_NOT_ACTIVE" };
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
  if (input.attacker.sideId === input.target.sideId) {
    return { ok: false, reason: "FRIENDLY_TARGET" };
  }
  if (!input.sectorResolver({
    attackerCell: input.attackerCell,
    targetCell: input.targetCell,
    facing: input.attacker.facing
  })) {
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
  sectorResolver: BroadsideSectorResolver;
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
    sectorResolver: input.sectorResolver,
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
