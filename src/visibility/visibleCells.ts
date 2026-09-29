import type { BarrierSegment } from "../barriers/barrierGeometry";
import { firstBarrierIntersection } from "../barriers/barrierGeometry";
import { cellKey } from "../grid/strategicGrid";
import type { GridDistancePort } from "../routes/routeMath";
import type { GridCellCoord, Vector2 } from "../shared/types";

export interface VisionObserver {
  position: Vector2;
  detectionRangeCells: number;
  ignoresVisionBarriers: boolean;
}

export interface VisibleCellsInput {
  cells: readonly GridCellCoord[];
  observers: readonly VisionObserver[];
  cellToSceneCenter: (cell: GridCellCoord) => Vector2;
  sceneToCell: (position: Vector2) => GridCellCoord;
  distancePort: GridDistancePort;
  visionBarriers: readonly BarrierSegment[];
}

export async function visibleCellsForObservers(input: VisibleCellsInput): Promise<Set<string>> {
  const visible = new Set<string>();
  if (input.cells.length === 0 || input.observers.length === 0) return visible;

  const cellsByKey = new Map(input.cells.map((cell) => [cellKey(cell), cell]));
  const allCells = [...cellsByKey.values()];
  for (const observer of input.observers) {
    const origin = input.sceneToCell(observer.position);
    const radius = Math.max(0, observer.detectionRangeCells);
    const maxOffset = Math.ceil(radius) + 1;
    const candidates = allCells.filter((cell) =>
      Math.abs(cell.x - origin.x) <= maxOffset && Math.abs(cell.y - origin.y) <= maxOffset
    );
    let nextCandidate = 0;
    const worker = async () => {
      while (true) {
        const cell = candidates[nextCandidate++];
        if (!cell) return;
        const center = input.cellToSceneCenter(cell);
        const distance = await input.distancePort.distance(observer.position, center);
        if (distance > radius) continue;
        if (!observer.ignoresVisionBarriers && firstBarrierIntersection(
          { from: observer.position, to: center }, input.visionBarriers
        )) continue;
        visible.add(cellKey(cell));
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, () => worker()));
  }
  return visible;
}
