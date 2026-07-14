import { describe, expect, it } from "vitest";
import { interpolatePosition, isSleepGap } from "./interpolation";

describe("movement interpolation", () => {
  it("clamps progress to the segment", () => {
    expect(interpolatePosition({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({ x: 2.5, y: 5 });
    expect(interpolatePosition({ x: 0, y: 0 }, { x: 10, y: 20 }, 2)).toEqual({ x: 10, y: 20 });
  });

  it("classifies only gaps over three seconds as sleep gaps", () => {
    expect(isSleepGap(3)).toBe(false);
    expect(isSleepGap(3.001)).toBe(true);
  });
});
