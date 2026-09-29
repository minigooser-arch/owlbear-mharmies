import { describe, expect, it } from "vitest";
import { buildFogOfWarOverlay, deriveGridBounds } from "./fogOfWarOverlay";

describe("fog of war overlay", () => {
  it("derives a finite map rectangle from stored strategic cells", () => {
    expect(deriveGridBounds({
      "-2,3": {},
      "4,-1": {},
      "1,5": {}
    })).toEqual({ minX: -2, maxX: 4, minY: -1, maxY: 5 });
  });

  it("builds one transparent-hole image mask instead of one item per cell", () => {
    const overlay = buildFogOfWarOverlay({
      dpi: 100,
      bounds: { minX: 0, maxX: 9, minY: 0, maxY: 5 },
      observers: [{ cell: { x: 2, y: 3 }, rangeCells: 4 }]
    });

    expect(overlay.key).toBe("FOG_OF_WAR");
    expect(overlay.item).toMatchObject({
      type: "IMAGE",
      position: { x: 500, y: 300 },
      layer: "FOG",
      image: { width: 1000, height: 600, mime: "image/svg+xml" },
      grid: { dpi: 100, offset: { x: 0, y: 0 } },
      metadata: { "com.letopis.army-control/map-overlay": { kind: "FOG_OF_WAR" } }
    });
    const url = String((overlay.item as unknown as { image: { url: string } }).image.url);
    const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
    expect(svg).toContain("<mask");
    expect(svg).toContain("circle");
  });
});
