import { describe, expect, it } from "vitest";
import { armyFormationCap, portTransportMovementCost, shipBunkeringBonus } from "./cityEffects";
import type { SceneState } from "../shared/types";

const scene = {
  version: 8, revision: 1, settings: {} as SceneState["settings"], turn: { turnNumber: 1, autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
  sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }], states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }],
  gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } } },
  terrain: { version: 1, types: {} }, wars: [], relations: {}, stateRelations: {}, strategicCities: [{ id: "c", name: "C", cells: [{ x: 0, y: 0 }], recognizedStateId: "s", deFactoStateId: "s", factionInfluenceId: "f", mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [{ id: "t", type: "TRAINING_GROUND", cell: { x: 0, y: 0 } }, { id: "p", type: "PORT", cell: { x: 2, y: 2 } }, { id: "k", type: "BUNKERING_STATION", cell: { x: 1, y: 1 } }] }]
} as unknown as SceneState;

describe("city effects", () => {
  it("calculates training-ground, exact port, and bunkering effects", () => {
    expect(armyFormationCap(scene, "c")).toBe(15);
    expect(portTransportMovementCost(scene, "c", { x: 2, y: 2 })).toBe(0);
    expect(portTransportMovementCost(scene, "c", { x: 1, y: 1 })).toBe(3);
    expect(shipBunkeringBonus(scene, "c", { x: 0, y: 0 })).toBe(2);
  });
});
