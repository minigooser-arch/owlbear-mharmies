import { describe, expect, it } from "vitest";
import { compactCellRectangles, type StyledCell } from "./compactOverlayGeometry";

function cell(x: number, y: number, styleKey = "plain"): StyledCell {
  return { cell: { x, y }, styleKey };
}

describe("compactCellRectangles", () => {
  it("keeps a single cell as one rectangle", () => {
    expect(compactCellRectangles([cell(2, 3, "forest")])).toEqual([
      { styleKey: "forest", minX: 2, minY: 3, maxX: 2, maxY: 3 }
    ]);
  });

  it("merges equal horizontal runs and then equal runs on adjacent rows", () => {
    expect(compactCellRectangles([
      cell(0, 0), cell(1, 0), cell(2, 0),
      cell(0, 1), cell(1, 1), cell(2, 1)
    ])).toEqual([
      { styleKey: "plain", minX: 0, minY: 0, maxX: 2, maxY: 1 }
    ]);
  });

  it("does not merge across styles, gaps, or unequal row runs", () => {
    expect(compactCellRectangles([
      cell(0, 0, "forest"), cell(1, 0, "forest"), cell(3, 0, "forest"),
      cell(0, 1, "forest"), cell(1, 1, "road"), cell(3, 1, "forest")
    ])).toEqual([
      { styleKey: "forest", minX: 0, minY: 0, maxX: 1, maxY: 0 },
      { styleKey: "forest", minX: 3, minY: 0, maxX: 3, maxY: 1 },
      { styleKey: "forest", minX: 0, minY: 1, maxX: 0, maxY: 1 },
      { styleKey: "road", minX: 1, minY: 1, maxX: 1, maxY: 1 }
    ]);
  });

  it("is independent of insertion order and duplicate input cells", () => {
    const expected = [
      { styleKey: "forest", minX: 0, minY: 0, maxX: 1, maxY: 1 },
      { styleKey: "road", minX: 4, minY: 2, maxX: 4, maxY: 2 }
    ];
    const ordered = [cell(0, 0, "forest"), cell(1, 0, "forest"), cell(0, 1, "forest"), cell(1, 1, "forest"), cell(4, 2, "road")];
    const shuffled = [ordered[4]!, ordered[2]!, ordered[0]!, ordered[3]!, ordered[1]!, ordered[0]!];
    expect(compactCellRectangles(ordered)).toEqual(expected);
    expect(compactCellRectangles(shuffled)).toEqual(expected);
  });

  it("compacts a homogeneous 61 by 115 map into one rectangle", () => {
    const cells = Array.from({ length: 115 }, (_, y) =>
      Array.from({ length: 61 }, (_, x) => cell(x, y))
    ).flat();
    expect(compactCellRectangles(cells)).toEqual([
      { styleKey: "plain", minX: 0, minY: 0, maxX: 60, maxY: 114 }
    ]);
  });

  it("keeps alternating 61-cell rows as 115 stable rectangles", () => {
    const cells = Array.from({ length: 115 }, (_, y) =>
      Array.from({ length: 61 }, (_, x) => cell(x, y, y % 2 === 0 ? "plain" : "forest"))
    ).flat();
    const rectangles = compactCellRectangles(cells);
    expect(rectangles).toHaveLength(115);
    expect(rectangles[0]).toEqual({ styleKey: "plain", minX: 0, minY: 0, maxX: 60, maxY: 0 });
    expect(rectangles[1]).toEqual({ styleKey: "forest", minX: 0, minY: 1, maxX: 60, maxY: 1 });
    expect(rectangles[114]).toEqual({ styleKey: "plain", minX: 0, minY: 114, maxX: 60, maxY: 114 });
  });

  it("preserves keys for unrelated rectangles after a one-cell edit", () => {
    const before = compactCellRectangles([
      cell(0, 0, "forest"), cell(1, 0, "forest"), cell(10, 10, "road")
    ]);
    const after = compactCellRectangles([
      cell(0, 0, "forest"), cell(1, 0, "plain"), cell(10, 10, "road")
    ]);
    expect(before.find((rectangle) => rectangle.styleKey === "road"))
      .toEqual(after.find((rectangle) => rectangle.styleKey === "road"));
  });
});
