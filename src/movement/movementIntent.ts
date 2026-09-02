import type { GridCellCoord, SideRelation } from "../shared/types";

export interface MovementIntent {
  armyId: string;
  sideId: string;
  from: GridCellCoord;
  to: GridCellCoord;
}

export interface StrategicOccupant {
  armyId: string;
  sideId: string;
  cell: GridCellCoord;
}

export type StrategicConflictEdge = readonly [string, string];

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

export function findStrategicConflictEdges(
  intents: readonly MovementIntent[],
  relationForSides: (leftSideId: string, rightSideId: string) => SideRelation,
  stationaryOccupants: readonly StrategicOccupant[] = []
): StrategicConflictEdge[] {
  const edges: StrategicConflictEdge[] = [];
  for (let leftIndex = 0; leftIndex < intents.length; leftIndex += 1) {
    const left = intents[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < intents.length; rightIndex += 1) {
      const right = intents[rightIndex]!;
      if (relationForSides(left.sideId, right.sideId) !== "ENEMY") continue;
      const sameDestination = sameCell(left.to, right.to);
      const swap = sameCell(left.from, right.to) && sameCell(left.to, right.from);
      if (sameDestination || swap) edges.push([left.armyId, right.armyId]);
    }
  }
  for (const intent of intents) {
    for (const occupant of stationaryOccupants) {
      if (intent.armyId === occupant.armyId) continue;
      if (relationForSides(intent.sideId, occupant.sideId) !== "ENEMY") continue;
      if (sameCell(intent.to, occupant.cell)) edges.push([intent.armyId, occupant.armyId]);
    }
  }
  return edges;
}
