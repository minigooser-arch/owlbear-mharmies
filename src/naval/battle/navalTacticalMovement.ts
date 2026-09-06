import type {
  GridCellCoord,
  NavalBattleState,
  ShipFacing,
  ShipState
} from "../../shared/types";
import { spendNavalMovement } from "./navalRoundFlow";

export type TacticalTurnDirection = "LEFT" | "RIGHT";

const FORWARD_DELTA: Readonly<Record<ShipFacing, GridCellCoord>> = {
  NORTH: { x: 0, y: -1 },
  EAST: { x: 1, y: 0 },
  SOUTH: { x: 0, y: 1 },
  WEST: { x: -1, y: 0 }
};

const LEFT_TURN: Readonly<Record<ShipFacing, ShipFacing>> = {
  NORTH: "WEST",
  WEST: "SOUTH",
  SOUTH: "EAST",
  EAST: "NORTH"
};

const RIGHT_TURN: Readonly<Record<ShipFacing, ShipFacing>> = {
  NORTH: "EAST",
  EAST: "SOUTH",
  SOUTH: "WEST",
  WEST: "NORTH"
};

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function battleContainsCell(battle: NavalBattleState, cell: GridCellCoord): boolean {
  return battle.areaCells.some((candidate) => sameCell(candidate, cell));
}

export function forwardCell(cell: GridCellCoord, facing: ShipFacing): GridCellCoord {
  const delta = FORWARD_DELTA[facing];
  return { x: cell.x + delta.x, y: cell.y + delta.y };
}

export interface TacticalStepResult {
  battle: NavalBattleState;
  destination: GridCellCoord;
}

export function applyForwardTacticalStep(
  battle: NavalBattleState,
  shipId: string,
  ship: Pick<ShipState, "facing">,
  from: GridCellCoord,
  destination: GridCellCoord
): TacticalStepResult {
  const expected = forwardCell(from, ship.facing);
  if (!sameCell(expected, destination)) {
    throw new Error("Ship may move only forward");
  }
  if (!battleContainsCell(battle, destination)) {
    throw new Error("Outside naval battle area");
  }
  return {
    battle: spendNavalMovement(battle, shipId, 1),
    destination: { ...destination }
  };
}

export interface TacticalTurnResult {
  battle: NavalBattleState;
  ship: ShipState;
}

export function applyTacticalTurn(
  battle: NavalBattleState,
  shipId: string,
  ship: ShipState,
  direction: TacticalTurnDirection
): TacticalTurnResult {
  const nextBattle = spendNavalMovement(battle, shipId, 1);
  const facing = direction === "LEFT" ? LEFT_TURN[ship.facing] : RIGHT_TURN[ship.facing];
  return {
    battle: nextBattle,
    ship: {
      ...ship,
      facing,
      revision: ship.revision + 1
    }
  };
}
