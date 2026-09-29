import { describe, expect, it } from "vitest";
import type { BarrierSegment } from "../barriers/barrierGeometry";
import type { GridCellCoord, Vector2 } from "../shared/types";
import type { GridDistancePort } from "../routes/routeMath";
import { visibleCellsForObservers, type VisionObserver } from "./visibleCells";

const distancePort: GridDistancePort = {
  async distance(from: Vector2, to: Vector2): Promise<number> {
    return Math.hypot(to.x - from.x, to.y - from.y);
  }
};

const cellToSceneCenter = (cell: GridCellCoord): Vector2 => ({
  x: cell.x,
  y: cell.y
});

const sceneToCell = (position: Vector2): GridCellCoord => ({
  x: Math.floor(position.x),
  y: Math.floor(position.y)
});

const cells = (from: number, to: number): GridCellCoord[] => {
  const result: GridCellCoord[] = [];
  for (let y = from; y <= to; y += 1) {
    for (let x = from; x <= to; x += 1) result.push({ x, y });
  }
  return result;
};

describe("visibleCellsForObservers", () => {
  it("returns the union of cells inside every observer range", async () => {
    const observers: VisionObserver[] = [
      { position: { x: 0, y: 0 }, detectionRangeCells: 1, ignoresVisionBarriers: true },
      { position: { x: 2, y: 0 }, detectionRangeCells: 0, ignoresVisionBarriers: true }
    ];

    await expect(visibleCellsForObservers({
      cells: cells(-1, 3),
      observers,
      cellToSceneCenter,
      sceneToCell,
      distancePort,
      visionBarriers: []
    })).resolves.toEqual(new Set(["-1,0", "0,-1", "0,0", "0,1", "1,0", "2,0"]));
  });

  it("excludes cells blocked by a vision barrier unless the observer ignores barriers", async () => {
    const barrier: BarrierSegment = {
      barrierId: "wall",
      from: { x: 0.5, y: -1 },
      to: { x: 0.5, y: 1 }
    };
    const base = {
      cells: cells(-1, 1),
      cellToSceneCenter,
      sceneToCell,
      distancePort,
      visionBarriers: [barrier]
    };

    await expect(visibleCellsForObservers({
      ...base,
      observers: [{ position: { x: 0, y: 0 }, detectionRangeCells: 2, ignoresVisionBarriers: false }]
    })).resolves.not.toContain("1,0");
    await expect(visibleCellsForObservers({
      ...base,
      observers: [{ position: { x: 0, y: 0 }, detectionRangeCells: 2, ignoresVisionBarriers: true }]
    })).resolves.toContain("1,0");
  });
});
