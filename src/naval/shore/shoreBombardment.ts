import type {
  ArmyState,
  GridCellCoord,
  NavalBattleState,
  ShipState
} from "../../shared/types";
import { useNavalAction } from "../battle/navalRoundFlow";
import { SHIP_CLASSES } from "../ships/shipClasses";

export interface ShoreBombardmentSectorInput {
  attackerCell: GridCellCoord;
  targetCell: GridCellCoord;
  facing: ShipState["facing"];
}

export type ShoreBombardmentSectorResolver = (
  input: ShoreBombardmentSectorInput
) => boolean;

export type ShoreBombardmentFailure =
  | "SHIP_NOT_ACTIVE"
  | "SHIP_DESTROYED"
  | "ACTION_ALREADY_USED"
  | "SHIP_CANNOT_BOMBARD"
  | "FRIENDLY_TARGET"
  | "TARGET_NOT_VISIBLE"
  | "TARGET_NOT_ON_LAND"
  | "TARGET_DESTROYED"
  | "BOMBARDMENT_ALREADY_USED"
  | "OUTSIDE_BROADSIDE_SECTOR"
  | "OUT_OF_RANGE"
  | "NO_NAVAL_LOS";

export interface ValidateShoreBombardmentTargetInput {
  attackerId: string;
  attacker: ShipState;
  targetId: string;
  target: ArmyState;
  attackerCell: GridCellCoord;
  targetCell: GridCellCoord;
  currentTurn: number;
  targetVisible: boolean;
  targetCellSupportsLand: boolean;
  sectorResolver: ShoreBombardmentSectorResolver;
  distanceCells(from: GridCellCoord, to: GridCellCoord): number;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
  battle?: NavalBattleState;
}

export type ShoreBombardmentValidation =
  | { ok: true; range: number; dice: 2 | 3 }
  | { ok: false; reason: ShoreBombardmentFailure; range?: number };

function bombardmentDice(ship: ShipState): 2 | 3 | null {
  if (ship.classId === "BATTLESHIP") return 3;
  if (ship.classId === "CRUISER") return 2;
  return null;
}

export function validateShoreBombardmentTarget(
  input: ValidateShoreBombardmentTargetInput
): ShoreBombardmentValidation {
  if (input.battle) {
    if (input.battle.currentShipId !== input.attackerId) {
      return { ok: false, reason: "SHIP_NOT_ACTIVE" };
    }
    if (input.battle.actionUsedByShip[input.attackerId]) {
      return { ok: false, reason: "ACTION_ALREADY_USED" };
    }
  }
  if (input.attacker.hp <= 0) {
    return { ok: false, reason: "SHIP_DESTROYED" };
  }

  const dice = bombardmentDice(input.attacker);
  if (dice === null) {
    return { ok: false, reason: "SHIP_CANNOT_BOMBARD" };
  }
  if (input.target.health.hp <= 0) {
    return { ok: false, reason: "TARGET_DESTROYED" };
  }
  if (input.attacker.sideId === input.target.sideId) {
    return { ok: false, reason: "FRIENDLY_TARGET" };
  }
  if (!input.targetVisible) {
    return { ok: false, reason: "TARGET_NOT_VISIBLE" };
  }
  if (!input.targetCellSupportsLand) {
    return { ok: false, reason: "TARGET_NOT_ON_LAND" };
  }
  if (input.attacker.shoreBombardmentUsedOnTurn === input.currentTurn) {
    return { ok: false, reason: "BOMBARDMENT_ALREADY_USED" };
  }
  if (!input.sectorResolver({
    attackerCell: input.attackerCell,
    targetCell: input.targetCell,
    facing: input.attacker.facing
  })) {
    return { ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" };
  }

  const weapon = SHIP_CLASSES[input.attacker.classId];
  const range = input.distanceCells(input.attackerCell, input.targetCell);
  if (range < weapon.normalRangeMin || range > weapon.normalRangeMax) {
    return { ok: false, reason: "OUT_OF_RANGE", range };
  }
  if (!input.hasLineOfSight(input.attackerCell, input.targetCell)) {
    return { ok: false, reason: "NO_NAVAL_LOS" };
  }

  return { ok: true, range, dice };
}

export interface CommitShoreBombardmentInput extends ValidateShoreBombardmentTargetInput {
  rollD6(): number;
  battleShips?: Readonly<Record<string, ShipState>>;
}

export type CommitShoreBombardmentResult =
  | {
      ok: true;
      damage: number;
      range: number;
      attacker: ShipState;
      target: ArmyState;
      battle?: NavalBattleState;
    }
  | { ok: false; reason: ShoreBombardmentFailure; range?: number };

export function commitShoreBombardment(
  input: CommitShoreBombardmentInput
): CommitShoreBombardmentResult {
  const validation = validateShoreBombardmentTarget(input);
  if (!validation.ok) return validation;

  let damage = 0;
  for (let i = 0; i < validation.dice; i += 1) {
    damage += input.rollD6();
  }

  const attacker: ShipState = {
    ...input.attacker,
    shoreBombardmentUsedOnTurn: input.currentTurn,
    revision: input.attacker.revision + 1
  };
  const target: ArmyState = {
    ...input.target,
    health: {
      ...input.target.health,
      hp: Math.max(0, input.target.health.hp - damage)
    },
    revision: input.target.revision + 1
  };

  if (!input.battle) {
    return {
      ok: true,
      damage,
      range: validation.range,
      attacker,
      target
    };
  }

  const ships = {
    ...(input.battleShips ?? {}),
    [input.attackerId]: attacker
  };
  return {
    ok: true,
    damage,
    range: validation.range,
    attacker,
    target,
    battle: useNavalAction(input.battle, ships, input.attackerId)
  };
}
