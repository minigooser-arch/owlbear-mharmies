import { describe, expect, it } from "vitest";
import { migrateArmyState, migrateBarrierState, migrateSceneState } from "./migrations";

describe("metadata migrations", () => {
  it("migrates a v0 army and fills barrier exceptions", () => {
    const result = migrateArmyState({
      version: 0,
      registered: true,
      sideId: "red",
      status: "IDLE",
      route: []
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 1,
        status: "READY",
        ignoresMovementBarriers: false,
        ignoresVisionBarriers: false
      }
    });
  });

  it("refuses a future schema without modifying it", () => {
    expect(migrateSceneState({ version: 99 })).toEqual({
      ok: false,
      issue: { code: "FUTURE_VERSION", version: 99 }
    });
  });

  it("migrates a v0 barrier to independent movement and vision flags", () => {
    expect(migrateBarrierState({ version: 0, blocks: false })).toMatchObject({
      ok: true,
      value: { version: 1, blocksMovement: false, blocksVision: false }
    });
  });
});
