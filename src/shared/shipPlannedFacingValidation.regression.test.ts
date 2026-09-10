import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { normalizeShipState } from "./validation";

describe("ship planned-facing normalization", () => {
  it("preserves a valid planned facing", () => {
    const raw = {
      ...createRegisteredShip("red", "IRONCLAD", "EAST"),
      plannedFacing: "WEST"
    };
    expect(normalizeShipState(raw)).toMatchObject({
      ok: true,
      value: { facing: "EAST", plannedFacing: "WEST" }
    });
  });

  it("normalizes a missing planned facing to null for legacy ships", () => {
    expect(normalizeShipState(createRegisteredShip("red", "IRONCLAD", "EAST"))).toMatchObject({
      ok: true,
      value: { plannedFacing: null }
    });
  });

  it("drops an invalid planned facing to null", () => {
    const raw = {
      ...createRegisteredShip("red", "IRONCLAD", "EAST"),
      plannedFacing: "UP"
    };
    expect(normalizeShipState(raw)).toMatchObject({
      ok: true,
      value: { plannedFacing: null }
    });
  });
});
