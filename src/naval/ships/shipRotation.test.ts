import { describe, expect, it } from "vitest";
import { facingForRotation, rotationForFacing } from "./shipRotation";

describe("ship rotation", () => {
  it("uses the canonical clockwise Owlbear convention", () => {
    expect(rotationForFacing("NORTH")).toBe(0);
    expect(rotationForFacing("EAST")).toBe(90);
    expect(rotationForFacing("SOUTH")).toBe(180);
    expect(rotationForFacing("WEST")).toBe(270);
  });

  it("normalizes admin rotation back to the nearest cardinal facing", () => {
    expect(facingForRotation(359)).toBe("NORTH");
    expect(facingForRotation(91)).toBe("EAST");
    expect(facingForRotation(181)).toBe("SOUTH");
    expect(facingForRotation(-90)).toBe("WEST");
  });
});
