import { describe, expect, it } from "vitest";
import { buildSupplyOverlays, supplyOverlayKey } from "./supplyOverlayService";

it("builds a replaceable local supply overlay from a path", () => {
  const overlays = buildSupplyOverlays("army-1", [{ x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }], "#45a3ff");
  expect(overlays).toHaveLength(1);
  expect(overlays[0]).toMatchObject({ key: "army-1/LINE", item: { type: "CURVE", points: [{ x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }] } });
  expect(supplyOverlayKey({ id: "x", type: "CURVE", position: { x: 0, y: 0 }, metadata: { "com.letopis.army-control/supply-overlay": { armyId: "army-1", kind: "LINE" } } })).toBe("army-1/LINE");
});

describe("empty supply overlay", () => {
  it("renders nothing when no route exists", () => expect(buildSupplyOverlays("army-1", null, "#45a3ff")).toEqual([]));
});
