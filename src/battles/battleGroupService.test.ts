import { describe, expect, it } from "vitest";
import type { ArmyState, BattleGroup } from "../shared/types";
import {
  joinReinforcements,
  mergeBattleGroups,
  nextBattleName,
  rebuildBattleGroups,
  releaseBattleGroup
} from "./battleGroupService";

function army(status: ArmyState["status"], routeX = 5): ArmyState {
  return {
    version: 1,
    registered: true,
    sideId: "A",
    status,
    overrides: {},
    route: [{ x: routeX, y: 0 }],
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

describe("BattleGroup lifecycle", () => {
  it("joins reinforcement through direct contact and keeps the lexical group id", () => {
    const groups: BattleGroup[] = [
      { battleId: "battle-002", name: "Бой 2", participantIds: ["b", "a"], revision: 1 }
    ];
    const result = joinReinforcements(groups, [["b", "c"]], () => "battle-999");
    expect(result).toEqual([
      { battleId: "battle-002", name: "Бой 2", participantIds: ["a", "b", "c"], revision: 2 }
    ]);
  });

  it("merges and splits groups from current direct enemy contact components", () => {
    const groups: BattleGroup[] = [
      { battleId: "battle-002", name: "Бой 2", participantIds: ["a", "b"], revision: 1 },
      { battleId: "battle-001", name: "Бой 1", participantIds: ["c", "d"], revision: 1 }
    ];
    expect(
      rebuildBattleGroups(["a", "b", "c", "d"], [["a", "b"], ["b", "c"]], groups, () => "new")
    ).toEqual([
      { battleId: "battle-001", name: "Бой 1", participantIds: ["a", "b", "c"], revision: 2 }
    ]);
  });

  it("preserves the lexically surviving battle name on merge", () => {
    expect(mergeBattleGroups([
      { battleId: "b", name: "Юг", participantIds: ["b1", "b2"], revision: 1 },
      { battleId: "a", name: "Север", participantIds: ["a1", "a2"], revision: 4 }
    ], ["a", "b"])[0]?.name).toBe("Север");
  });

  it("uses the first free numbered name", () => {
    expect(nextBattleName([
      { battleId: "x", name: "Бой 1", participantIds: [], revision: 1 },
      { battleId: "y", name: "Бой 3", participantIds: [], revision: 1 }
    ])).toBe("Бой 2");
  });

  it("releases participants to paused without deleting routes", () => {
    const states = new Map([
      ["a", army("IN_BATTLE")],
      ["b", army("IN_BATTLE", 8)]
    ]);
    const result = releaseBattleGroup(
      [{ battleId: "battle-1", name: "Бой 1", participantIds: ["a", "b"], revision: 1 }],
      states,
      "battle-1"
    );
    expect(result.groups).toEqual([]);
    expect(result.armies.get("a")).toMatchObject({ status: "PAUSED", route: [{ x: 5, y: 0 }] });
    expect(result.armies.get("b")).toMatchObject({ status: "PAUSED", route: [{ x: 8, y: 0 }] });
  });
});
