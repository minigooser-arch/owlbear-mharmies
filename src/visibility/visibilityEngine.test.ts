import { describe, expect, it } from "vitest";
import type { DetectionGraph } from "./detectionGraph";
import { visibleArmyIdsForPlayer } from "./visibilityEngine";

function graph(entries: Record<string, string[]>): DetectionGraph {
  return {
    visibleTargetsBySide: new Map(
      Object.entries(entries).map(([sideId, targets]) => [sideId, new Set(targets)])
    ),
    observersBySide: new Map()
  };
}

describe("player visibility", () => {
  const armies = [
    { id: "a", sideId: "A" },
    { id: "b", sideId: "B" },
    { id: "c", sideId: "C" }
  ];

  it("gives the GM every army and a player only own plus detected armies", () => {
    const detectionGraph = graph({ A: ["b"], B: [], C: [] });
    expect(
      visibleArmyIdsForPlayer({ isGM: true, playerSideIds: [], armies, detectionGraph, battleGroups: [] })
    ).toEqual(new Set(["a", "b", "c"]));
    expect(
      visibleArmyIdsForPlayer({
        isGM: false,
        playerSideIds: ["A"],
        armies,
        detectionGraph,
        battleGroups: []
      })
    ).toEqual(new Set(["a", "b"]));
  });

  it("reveals all participants of a battle visible through one participant", () => {
    expect(
      visibleArmyIdsForPlayer({
        isGM: false,
        playerSideIds: ["A"],
        armies,
        detectionGraph: graph({ A: [] }),
        battleGroups: [{ battleId: "battle", participantIds: ["a", "b"], revision: 1 }]
      })
    ).toEqual(new Set(["a", "b"]));
  });
});
