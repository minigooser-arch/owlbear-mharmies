import type {
  GridCellCoord,
  NavalBattleState,
  ShipState
} from "../../shared/types";
import { useNavalAction } from "../battle/navalRoundFlow";
import { hospitalSupportDice, hospitalSupportRange, shipEffectiveMaxHp } from "../../upgrades/unitUpgrades";

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

function withinSupportRange(left: GridCellCoord, right: GridCellCoord, range: number): boolean {
  const distance = Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
  return distance >= 1 && distance <= range;
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
  if (!withinSupportRange(input.hospitalCell, input.targetCell, hospitalSupportRange(input.hospital))) {
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

  let rolledTemporaryHp = 0;
  for (let index = 0; index < hospitalSupportDice(input.hospital); index += 1) {
    rolledTemporaryHp += input.rollD6();
  }
  const maxHp = shipEffectiveMaxHp(input.target);
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
