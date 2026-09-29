import { describe, expect, it } from "vitest";
import { buildFogOfWarOverlays, deriveGridBounds } from "./fogOfWarOverlay";

describe("fog of war overlay", () => {
  it("derives a finite map rectangle from stored strategic cells", () => {
    expect(deriveGridBounds({
      "-2,3": {},
      "4,-1": {},
      "1,5": {}
    })).toEqual({ minX: -2, maxX: 4, minY: -1, maxY: 5 });
  });

  it("builds compact neutral gray rectangle shapes for unrevealed cells", () => {
    const overlays = buildFogOfWarOverlays({
      dpi: 100,
      bounds: { minX: 0, maxX: 9, minY: 0, maxY: 5 },
      observers: [{ cell: { x: 2, y: 3 }, rangeCells: 4 }]
    });

    expect(overlays.length).toBeGreaterThan(0);
    expect(overlays.every(({ item }) => item)).toBe(true);
    expect(overlays[0]?.item).toMatchObject({
      type: "SHAPE",
      layer: "FOG",
      shapeType: "RECTANGLE",
      strokeColor: "#808080",
      strokeOpacity: 0,
      strokeWidth: 0,
      fillColor: "#808080",
      fillOpacity: 0.48,
      metadata: { "com.letopis.army-control/map-overlay": { kind: "FOG_OF_WAR" } }
    });
    expect(overlays.length).toBeGreaterThan(0);
    expect(overlays.every(({ item }) =>
      item.type === "SHAPE" &&
      typeof item.width === "number" && item.width > 0 &&
      typeof item.height === "number" && item.height > 0
    )).toBe(true);
    expect(overlays.every(({ key }) => key.startsWith("FOG_OF_WAR_V5/"))).toBe(true);
  });
});
