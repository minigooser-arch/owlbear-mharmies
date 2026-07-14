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
    const scene = normalizeSceneState({ version: 1 });
    expect(scene.ok).toBe(true);
    if (scene.ok) expect(scene.value.settings).toEqual(DEFAULT_SETTINGS);
  });
});
