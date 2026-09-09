import type { GridCellCoord, ShipFacing } from "../../shared/types";

const ORDER: readonly ShipFacing[] = ["NORTH", "EAST", "SOUTH", "WEST"];

export function facingForStep(from: GridCellCoord, to: GridCellCoord): ShipFacing | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return "NORTH";
  if (dx === 1 && dy === 0) return "EAST";
  if (dx === 0 && dy === 1) return "SOUTH";
  if (dx === -1 && dy === 0) return "WEST";
  return undefined;
}

export function quarterTurnCost(from: ShipFacing, to: ShipFacing): number {
  const fromIndex = ORDER.indexOf(from);
  const toIndex = ORDER.indexOf(to);
  const clockwise = (toIndex - fromIndex + ORDER.length) % ORDER.length;
  return Math.min(clockwise, ORDER.length - clockwise);
}
