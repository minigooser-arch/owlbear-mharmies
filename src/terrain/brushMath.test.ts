import { describe, expect, it } from "vitest";
import { getBrushCells, rasterizeBrushStroke } from "./brushMath";

describe("brush geometry", () => {
  it("returns exactly nine cells for a 3x3 brush", () => {
    expect(getBrushCells({ x: 0, y: 0 }, 3)).toEqual([
      { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
      { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }
    ]);
  });

  it("fills gaps when dragging quickly between two centers", () => {
    expect(rasterizeBrushStroke({ x: 0, y: 0 }, { x: 4, y: 0 }, 1))
      .toEqual([
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }
      ]);
  });

  it("deduplicates overlapping footprints from a wide brush stroke", () => {
    const cells = rasterizeBrushStroke({ x: 0, y: 0 }, { x: 1, y: 0 }, 3);
    expect(cells).toHaveLength(12);
    expect(new Set(cells.map((cell) => `${cell.x},${cell.y}`)).size).toBe(12);
  });
});
