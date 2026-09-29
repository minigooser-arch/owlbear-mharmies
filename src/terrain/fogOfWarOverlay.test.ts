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

  it("builds compact neutral gray closed curves for unrevealed cells", () => {
    const overlays = buildFogOfWarOverlays({
      dpi: 100,
      bounds: { minX: 0, maxX: 9, minY: 0, maxY: 5 },
      observers: [{ cell: { x: 2, y: 3 }, rangeCells: 4 }]
    });

    expect(overlays.length).toBeGreaterThan(0);
    expect(overlays.every(({ item }) => item)).toBe(true);
    expect(overlays[0]?.item).toMatchObject({
      type: "CURVE",
      position: { x: 0, y: 0 },
      layer: "FOG",
      closed: true,
      strokeColor: "#808080",
      strokeOpacity: 0,
      strokeWidth: 0,
      fillColor: "#808080",
      fillOpacity: 0.42,
      metadata: { "com.letopis.army-control/map-overlay": { kind: "FOG_OF_WAR" } }
    });
    expect(overlays.length).toBeGreaterThan(0);
    expect(overlays.every(({ key }) => key.startsWith("FOG_OF_WAR_V4/"))).toBe(true);
  });
});
