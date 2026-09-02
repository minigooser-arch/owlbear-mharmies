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
    version: 3,
    registered: true,
    sideId: "A",
    status,
    overrides: {},
    route: [{ x: routeX, y: 0 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 }, supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
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

  it("preserves the ordinal-lowest mixed-case battle name on rebuild", () => {
    expect(rebuildBattleGroups(
      ["a1", "a2", "z1", "z2"],
      [["a1", "a2"], ["a2", "z1"], ["z1", "z2"]],
      [
        { battleId: "a", name: "Строчная", participantIds: ["a1", "a2"], revision: 1 },
        { battleId: "Z", name: "Прописная", participantIds: ["z1", "z2"], revision: 2 }
      ],
      () => "new"
    )).toEqual([
      {
        battleId: "Z",
        name: "Прописная",
        participantIds: ["a1", "a2", "z1", "z2"],
        revision: 3
      }
    ]);
  });

  it("preserves the ordinal-lowest mixed-case battle name on explicit merge", () => {
    expect(mergeBattleGroups([
      { battleId: "a", name: "Строчная", participantIds: ["a1", "a2"], revision: 1 },
      { battleId: "Z", name: "Прописная", participantIds: ["z1", "z2"], revision: 2 }
    ], ["a", "Z"])[0]).toMatchObject({ battleId: "Z", name: "Прописная" });
  });

  it("uses the first free numbered name", () => {
    expect(nextBattleName([
      { battleId: "x", name: "Бой 1", participantIds: [], revision: 1 },
      { battleId: "y", name: "Бой 3", participantIds: [], revision: 1 }
    ])).toBe("Бой 2");
  });

  it("reuses the numbered name of a battle that disappears during rebuild", () => {
    expect(rebuildBattleGroups(
      ["new-1", "new-2"],
      [["new-1", "new-2"]],
      [{ battleId: "old", name: "Бой 1", participantIds: ["old-1", "old-2"], revision: 1 }],
      () => "new"
    )).toEqual([
      { battleId: "new", name: "Бой 1", participantIds: ["new-1", "new-2"], revision: 1 }
    ]);
  });

  it("reserves a later survivor name while reusing a disappeared name", () => {
    expect(rebuildBattleGroups(
      ["a-new-1", "a-new-2", "z-old-1", "z-old-2"],
      [["a-new-1", "a-new-2"], ["z-old-1", "z-old-2"]],
      [
        { battleId: "gone", name: "Бой 2", participantIds: ["gone-1", "gone-2"], revision: 1 },
        { battleId: "z-survivor", name: "Бой 1", participantIds: ["z-old-1", "z-old-2"], revision: 4 }
      ],
      () => "new"
    )).toEqual([
      { battleId: "new", name: "Бой 2", participantIds: ["a-new-1", "a-new-2"], revision: 1 },
      {
        battleId: "z-survivor",
        name: "Бой 1",
        participantIds: ["z-old-1", "z-old-2"],
        revision: 5
      }
    ]);
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
