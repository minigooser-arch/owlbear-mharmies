import { describe, expect, it } from "vitest";
import type { GridDistancePort } from "../routes/routeMath";
import type { ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import { buildSceneDetectionGraph } from "./sceneDetectionGraph";

const distancePort: GridDistancePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y)
};

describe("scene detection graph city bonuses", () => {
  it("extends only a land army standing on an active watchtower", async () => {
    const scene = {
      version: 8,
      revision: 1,
      settings: { defaultDetectionRangeCells: 2, detectionMode: "INDEPENDENT" },
      sides: [
        { id: "a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" },
        { id: "b", name: "B", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "t" }
      ],
      states: [
        { id: "s", name: "S", color: "#fff", rulingFactionId: "a", active: true },
        { id: "t", name: "T", color: "#000", rulingFactionId: "b", active: true }
      ],
      gridMap: {
        version: 1,
        revision: 1,
        cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } }
      },
      terrain: { version: 1, defaultTerrainId: "land", types: {} },
      wars: [],
      relations: {},
      stateRelations: {},
      strategicCities: [{
        id: "c",
        name: "C",
        cells: [{ x: 0, y: 0 }],
        recognizedStateId: "s",
        deFactoStateId: "s",
        factionInfluenceId: "a",
        mayorId: null,
        isCapital: false,
        historicalBuildTypeCount: 0,
        buildings: [{ id: "w", type: "WATCHTOWER", cell: { x: 0, y: 0 } }]
      }]
    } as unknown as SceneState;
    const army = (id: string, sideId: string, x: number): { item: SceneItemRecord; state: ArmyState } => ({
      item: { id, type: "IMAGE", position: { x, y: 0 }, metadata: {} },
      state: { sideId, overrides: {}, ignoresVisionBarriers: false, upgrades: { recovery: {}, motorization: {}, reconnaissance: {} } } as unknown as ArmyState
    });
    const graph = await buildSceneDetectionGraph({
      scene,
      armies: [army("a1", "a", 0), army("b1", "b", 3)],
      sceneItems: [],
      distancePort,
      visionBarriers: [],
      positionToCell: (position) => ({ x: position.x, y: position.y })
    });
    expect(graph.visibleTargetsBySide.get("a")).toEqual(new Set(["b1"]));
  });
});
