import { describe, expect, it } from "vitest";
import { repairShipAtShipyard } from "../cities/cityEffects";
import type { SceneState, ShipState } from "../shared/types";

const scene = { version: 8, revision: 1, settings: {} as SceneState["settings"], turn: {} as SceneState["turn"], sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }], states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }], gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" }, "2,2": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } } }, terrain: { version: 1, types: {} }, wars: [], relations: {}, stateRelations: {}, strategicCities: [{ id: "c", name: "C", cells: [{ x: 0, y: 0 }], recognizedStateId: "s", deFactoStateId: "s", factionInfluenceId: "f", mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [{ id: "y", type: "SHIPYARD", cell: { x: 2, y: 2 } }] }] } as unknown as SceneState;
const ship = { version: 1, registered: true, sideId: "f", classId: "CRUISER", status: "READY", hp: 15, temporaryHp: 0, facing: "NORTH", plannedRoute: [], plannedFacing: null, globalMovementRemaining: 5, movementSpentThisTurn: false, battleId: null, detectionOverride: null, embarkedArmyId: null, shoreBombardmentUsedOnTurn: null, logisticsActionUsedOnTurn: null, revision: 1 } as ShipState;

describe("shipyard", () => {
  it("repairs up to 10 HP on the exact shipyard cell", () => {
    const repaired = repairShipAtShipyard(scene, ship, { x: 2, y: 2 }, 20, 1);
    expect(repaired.hp).toBe(25);
    expect(repairShipAtShipyard(scene, repaired, { x: 2, y: 2 }, 1, 1).hp).toBe(25);
    expect(repairShipAtShipyard(scene, { ...ship, sideId: "enemy" }, { x: 2, y: 2 }, 10, 1).hp).toBe(15);
  });
});
