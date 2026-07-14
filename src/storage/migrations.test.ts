import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
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

  it("migrates v1 sides to v2 without losing memberships", () => {
    const result = migrateSceneState({
      version: 1,
      revision: 7,
      settings: DEFAULT_SETTINGS,
      sides: [
        {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: ["player-1", "player-1"]
        }
      ],
      relations: {},
      battleGroups: []
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 2,
        revision: 7,
        sides: [
          {
            id: "red",
            name: "Красные",
            color: "#f00",
            playerIds: ["player-1"],
            leaderPlayerIds: []
          }
        ]
      }
    });
  });

  it("migrates a v0 scene through v1 to v2", () => {
    expect(migrateSceneState({
      version: 0,
      revision: 4,
      sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["p1"] }]
    })).toMatchObject({
      ok: true,
      value: {
        version: 2,
        revision: 4,
        sides: [{ id: "red", playerIds: ["p1"], leaderPlayerIds: [] }]
      }
    });
  });

  it("rejects a present non-numeric scene version instead of treating it as missing", () => {
    expect(migrateSceneState({ version: "1" })).toEqual({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "version" }
    });
    expect(migrateSceneState({ version: null })).toEqual({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "version" }
    });
  });

  it("migrates a v0 barrier to independent movement and vision flags", () => {
    expect(migrateBarrierState({ version: 0, blocks: false })).toMatchObject({
      ok: true,
      value: { version: 1, blocksMovement: false, blocksVision: false }
    });
  });
});
