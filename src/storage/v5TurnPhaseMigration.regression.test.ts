import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { migrateSceneState } from "./migrations";

describe("v5 turn phase migration", () => {
  it("preserves an already closed POST_MOVEMENT phase", () => {
    const result = migrateSceneState({
      version: 5,
      revision: 1,
      settings: structuredClone(DEFAULT_SETTINGS),
      sides: [],
      states: [],
      relations: {},
      battleGroups: [],
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: { version: 1, revision: 0, cells: {} },
      wars: [],
      turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "POST_MOVEMENT" }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.turn.phase).toBe("POST_MOVEMENT");
  });
});
