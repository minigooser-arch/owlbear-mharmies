import { describe, expect, it } from "vitest";
import { BarrierSegmentIndex, firstBarrierIntersection } from "./barrierGeometry";

describe("barrier geometry", () => {
  it("finds the first blocking intersection", () => {
    const hit = firstBarrierIntersection(
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      [
        { barrierId: "late", from: { x: 8, y: -2 }, to: { x: 8, y: 2 } },
        { barrierId: "wall", from: { x: 4, y: -2 }, to: { x: 4, y: 2 } }
      ]
    );
    expect(hit?.barrierId).toBe("wall");
    expect(hit?.point.x).toBeCloseTo(4);
  });

  it("indexes only segments whose bounding boxes can intersect", () => {
    const index = new BarrierSegmentIndex([
      { barrierId: "near", from: { x: 1, y: -1 }, to: { x: 1, y: 1 } },
      { barrierId: "far", from: { x: 100, y: 100 }, to: { x: 110, y: 100 } }
    ]);
    expect(
      index.query({ from: { x: 0, y: 0 }, to: { x: 2, y: 0 } }).map((segment) => segment.barrierId)
    ).toEqual(["near"]);
  });
});
