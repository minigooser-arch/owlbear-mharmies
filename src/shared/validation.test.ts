import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./constants";
import { normalizeArmyState, normalizeSceneState } from "./validation";

describe("metadata validation", () => {
  it("applies safe defaults and rejects invalid numeric overrides", () => {
    const army = normalizeArmyState({
      version: 1,
      registered: true,
      sideId: "a",
      status: "READY",
      overrides: { speedCellsPerSecond: -2, maxRouteDistanceCells: 9 },
      route: [],
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      ignoresMovementBarriers: false,
      ignoresVisionBarriers: false,
      revision: 1
    });
    expect(army.ok).toBe(true);
    if (army.ok) {
      expect(army.value.overrides.speedCellsPerSecond).toBeUndefined();
      expect(army.value.overrides.maxRouteDistanceCells).toBe(9);
    }
  });

  it("uses the five-cell scene route limit", () => {
    const scene = normalizeSceneState({ version: 3 });
    expect(scene.ok).toBe(true);
    if (scene.ok) expect(scene.value.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes leaders as unique members without crossing side boundaries", () => {
    const scene = normalizeSceneState({
      version: 3,
      sides: [
        {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: ["member"],
          leaderPlayerIds: ["leader", "leader"]
        },
        {
          id: "blue",
          name: "Синие",
          color: "#00f",
          playerIds: [],
          leaderPlayerIds: ["leader"]
        }
      ]
    });

    expect(scene).toMatchObject({
      ok: true,
      value: {
        version: 3,
        sides: [
          { id: "red", playerIds: ["member", "leader"], leaderPlayerIds: ["leader"] },
          { id: "blue", playerIds: ["leader"], leaderPlayerIds: ["leader"] }
        ]
      }
    });
  });

  it("requires non-empty battle names and preserves them", () => {
    const scene = normalizeSceneState({
      version: 3,
      battleGroups: [
        { battleId: "north", name: "Север", participantIds: ["a", "b"], revision: 2 },
        { battleId: "blank", name: "   ", participantIds: ["c", "d"], revision: 1 }
      ]
    });

    expect(scene).toMatchObject({
      ok: true,
      value: {
        version: 3,
        battleGroups: [
          { battleId: "north", name: "Север", participantIds: ["a", "b"], revision: 2 }
        ]
      }
    });
  });
});
