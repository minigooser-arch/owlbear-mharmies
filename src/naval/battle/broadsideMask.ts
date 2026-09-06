import type { GridCellCoord, ShipClassId, ShipFacing } from "../../shared/types";

type Offset = readonly [dx: number, dy: number];

const BATTLESHIP_NORTH_OFFSETS: readonly Offset[] = Object.freeze([
  [-3, -3], [-2, -3], [2, -3], [3, -3],
  [-3, -2], [-2, -2], [2, -2], [3, -2],
  [-2, -1], [2, -1],
  [-2, 1], [2, 1],
  [-3, 2], [-2, 2], [2, 2], [3, 2],
  [-3, 3], [-2, 3], [2, 3], [3, 3]
]);

const CRUISER_NORTH_OFFSETS: readonly Offset[] = Object.freeze([
  [-2, -2], [2, -2],
  [-2, -1], [-1, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [1, 1], [2, 1],
  [-2, 2], [2, 2]
]);

const IRONCLAD_ADJACENT_NORTH_OFFSETS: readonly Offset[] = Object.freeze([
  [-1, 0], [1, 0]
]);

function key(dx: number, dy: number): string {
  return `${dx},${dy}`;
}

const BATTLESHIP_NORTH = new Set(BATTLESHIP_NORTH_OFFSETS.map(([dx, dy]) => key(dx, dy)));
const CRUISER_NORTH = new Set(CRUISER_NORTH_OFFSETS.map(([dx, dy]) => key(dx, dy)));
const IRONCLAD_ADJACENT_NORTH = new Set(
  IRONCLAD_ADJACENT_NORTH_OFFSETS.map(([dx, dy]) => key(dx, dy))
);

/**
 * Converts a world/grid offset for the supplied facing back into the canonical
 * north-facing coordinate system used by the approved naval diagrams.
 */
function toNorthOffset(facing: ShipFacing, dx: number, dy: number): Offset {
  switch (facing) {
    case "NORTH":
      return [dx, dy];
    case "EAST":
      return [dy, -dx];
    case "SOUTH":
      return [-dx, -dy];
    case "WEST":
      return [-dy, dx];
  }
}

function relativeOffset(attackerCell: GridCellCoord, targetCell: GridCellCoord): Offset {
  return [targetCell.x - attackerCell.x, targetCell.y - attackerCell.y];
}

export function isInNormalBroadsideMask(
  classId: ShipClassId,
  facing: ShipFacing,
  attackerCell: GridCellCoord,
  targetCell: GridCellCoord
): boolean {
  const [dx, dy] = relativeOffset(attackerCell, targetCell);
  const [northDx, northDy] = toNorthOffset(facing, dx, dy);
  const northKey = key(northDx, northDy);

  if (classId === "BATTLESHIP") return BATTLESHIP_NORTH.has(northKey);
  if (classId === "CRUISER" || classId === "IRONCLAD") return CRUISER_NORTH.has(northKey);
  return false;
}

export function isInIroncladAdjacentSpecialMask(
  facing: ShipFacing,
  attackerCell: GridCellCoord,
  targetCell: GridCellCoord
): boolean {
  const [dx, dy] = relativeOffset(attackerCell, targetCell);
  const [northDx, northDy] = toNorthOffset(facing, dx, dy);
  return IRONCLAD_ADJACENT_NORTH.has(key(northDx, northDy));
}
