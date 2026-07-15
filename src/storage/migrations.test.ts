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

  it("migrates v2 battles to deterministic names", () => {
    const result = migrateSceneState({
      version: 2,
      battleGroups: [
        { battleId: "z", participantIds: ["z1", "z2"], revision: 1 },
        { battleId: "a", participantIds: ["a1", "a2"], revision: 2 }
      ]
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 3,
        battleGroups: [
          { battleId: "a", name: "Бой 1" },
          { battleId: "z", name: "Бой 2" }
        ]
      }
    });
  });

  it("uses locale-independent ordinal battle id order", () => {
    const result = migrateSceneState({
      version: 2,
      battleGroups: [
        { battleId: "я", participantIds: ["я1", "я2"], revision: 1 },
        { battleId: "a", participantIds: ["a1", "a2"], revision: 1 },
        { battleId: "Z", participantIds: ["Z1", "Z2"], revision: 1 },
        { battleId: "é", participantIds: ["é1", "é2"], revision: 1 }
      ]
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        battleGroups: [
          { battleId: "Z", name: "Бой 1" },
          { battleId: "a", name: "Бой 2" },
          { battleId: "é", name: "Бой 3" },
          { battleId: "я", name: "Бой 4" }
        ]
      }
    });
  });

  it("migrates v1 sides through v2 to v3 without losing memberships", () => {
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
        version: 3,
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

  it("migrates a v0 scene through v1 and v2 to v3", () => {
    expect(migrateSceneState({
      version: 0,
      revision: 4,
      sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["p1"] }]
    })).toMatchObject({
      ok: true,
      value: {
        version: 3,
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
