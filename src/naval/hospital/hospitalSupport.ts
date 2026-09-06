import type {
  GridCellCoord,
  NavalBattleState,
  ShipState
} from "../../shared/types";
import { useNavalAction } from "../battle/navalRoundFlow";
import { SHIP_CLASSES } from "../ships/shipClasses";

export type HospitalSupportFailure =
  | "SHIP_NOT_ACTIVE"
  | "SHIP_DESTROYED"
  | "ACTION_ALREADY_USED"
  | "SHIP_NOT_HOSPITAL"
  | "SELF_TARGET_FORBIDDEN"
  | "TARGET_DESTROYED"
  | "TARGET_EXITED"
  | "TARGET_NOT_ADJACENT";

export interface HospitalSupportInput {
  battle: NavalBattleState;
  hospitalId: string;
  targetId: string;
  hospital: ShipState;
  target: ShipState;
  hospitalCell: GridCellCoord;
  targetCell: GridCellCoord;
}

export type HospitalSupportValidation =
  | { ok: true }
  | { ok: false; reason: HospitalSupportFailure };

function orthogonallyAdjacent(left: GridCellCoord, right: GridCellCoord): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

export function validateHospitalSupport(input: HospitalSupportInput): HospitalSupportValidation {
  if (input.battle.currentShipId !== input.hospitalId) {
    return { ok: false, reason: "SHIP_NOT_ACTIVE" };
  }
  if (input.hospital.hp <= 0) {
    return { ok: false, reason: "SHIP_DESTROYED" };
  }
  if (input.battle.actionUsedByShip[input.hospitalId]) {
    return { ok: false, reason: "ACTION_ALREADY_USED" };
  }
  if (input.hospital.classId !== "HOSPITAL") {
    return { ok: false, reason: "SHIP_NOT_HOSPITAL" };
  }
  if (input.hospitalId === input.targetId) {
    return { ok: false, reason: "SELF_TARGET_FORBIDDEN" };
  }
  if (input.target.hp <= 0) {
    return { ok: false, reason: "TARGET_DESTROYED" };
  }
  if (input.battle.exitedShipIds.includes(input.targetId)) {
    return { ok: false, reason: "TARGET_EXITED" };
  }
  if (!orthogonallyAdjacent(input.hospitalCell, input.targetCell)) {
    return { ok: false, reason: "TARGET_NOT_ADJACENT" };
  }
  return { ok: true };
}

export interface CommitHospitalSupportInput extends HospitalSupportInput {
  ships: Readonly<Record<string, ShipState>>;
  rollD6(): number;
}

export type CommitHospitalSupportResult =
  | {
      ok: true;
      rolledTemporaryHp: number;
      grantedTemporaryHp: number;
      target: ShipState;
      battle: NavalBattleState;
    }
  | { ok: false; reason: HospitalSupportFailure };

export function commitHospitalSupport(input: CommitHospitalSupportInput): CommitHospitalSupportResult {
  const validation = validateHospitalSupport(input);
  if (!validation.ok) return validation;

  const rolledTemporaryHp = input.rollD6() + input.rollD6();
  const maxHp = SHIP_CLASSES[input.target.classId].maxHp;
  const availableCapacity = Math.max(0, maxHp - input.target.hp - input.target.temporaryHp);
  const grantedTemporaryHp = Math.min(rolledTemporaryHp, availableCapacity);
  const target: ShipState = {
    ...input.target,
    temporaryHp: input.target.temporaryHp + grantedTemporaryHp,
    revision: input.target.revision + 1
  };
  const ships = {
    ...input.ships,
    [input.targetId]: target
  };

  return {
    ok: true,
    rolledTemporaryHp,
    grantedTemporaryHp,
    target,
    battle: useNavalAction(input.battle, ships, input.hospitalId)
  };
}
