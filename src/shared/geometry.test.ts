import { describe, expect, it } from "vitest";
import { segmentIntersection, segmentsIntersect } from "./geometry";

describe("segment geometry", () => {
  it("counts endpoint contact as an intersection", () => {
    expect(
      segmentsIntersect(
        { from: { x: 0, y: 0 }, to: { x: 2, y: 0 } },
        { from: { x: 2, y: 0 }, to: { x: 2, y: 2 } }
      )
    ).toBe(true);
  });

  it("does not intersect separated parallel segments", () => {
    expect(
      segmentIntersection(
        { from: { x: 0, y: 0 }, to: { x: 2, y: 0 } },
        { from: { x: 0, y: 1 }, to: { x: 2, y: 1 } }
      )
    ).toBeUndefined();
  });
});
