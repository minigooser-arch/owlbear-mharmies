import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { normalizeSceneState } from "../shared/validation";

describe("transport embark request scene persistence", () => {
  it("preserves valid requests and drops malformed requests during scene normalization", () => {
    const result = normalizeSceneState({
      version: 6,
      revision: 2,
      settings: { ...DEFAULT_SETTINGS },
      sides: [],
      states: [],
      relations: {},
      battleGroups: [],
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: { version: 1, revision: 0, cells: {} },
      wars: [],
      turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
      ships: {},
      navalBattleRequests: [],
      transportEmbarkRequests: [
        { id: "request-1", shipId: "transport", armyId: "army" },
        { id: "", shipId: "broken", armyId: "army" }
      ],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {}
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transportEmbarkRequests).toEqual([
      { id: "request-1", shipId: "transport", armyId: "army" }
    ]);
  });
});
