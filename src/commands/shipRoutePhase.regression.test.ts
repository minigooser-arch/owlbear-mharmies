import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState, TerrainType } from "../shared/types";
import type { CommandState } from "./commandProcessor";
import { applyShipStrategicRouteCommand } from "./shipStrategicRouteCommand";

function seaTerrain(): TerrainType {
  return {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
}

it("rejects strategic ship route planning outside the MOVEMENT phase", () => {
  const scene: SceneState = {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: { ...structuredClone(DEFAULT_TERRAIN.types), sea: seaTerrain() }
    },
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "POST_MOVEMENT" },
    ships: { ship: createRegisteredShip("red", "IRONCLAD", "EAST") },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  const state: CommandState = {
    scene,
    armies: {},
    barriers: {},
    items: {
      ship: { id: "ship", type: "IMAGE", position: { x: 0.5, y: 0.5 }, metadata: {} }
    },
    positions: { ship: { x: 0.5, y: 0.5 } }
  };

  expect(applyShipStrategicRouteCommand(
    state,
    { shipId: "ship", startCell: { x: 0, y: 0 }, cells: [{ x: 1, y: 0 }] },
    () => ({ x: 0, y: 0 })
  )).toBe("NOT_MOVEMENT_PHASE");
});
