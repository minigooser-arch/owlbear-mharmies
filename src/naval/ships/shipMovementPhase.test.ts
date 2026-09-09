import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import type { SceneItemRecord, SceneState } from "../../shared/types";
import { createRegisteredShip } from "./shipLifecycle";
import { resolvePlannedShipRoutes } from "./shipMovementPhase";

function scene(): SceneState {
  return {
    version: 6,
    revision: 2,
    settings: {} as SceneState["settings"],
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,-1": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: {
      turnNumber: 1,
      phase: "MOVEMENT",
      autoTurnsPaused: false,
      deferredUntil: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      lastProcessedBoundaryId: null
    },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

const items: Record<string, SceneItemRecord> = {
  ship: { id: "ship", type: "IMAGE", position: { x: 50, y: 50 }, metadata: {} }
};
const cellForPosition = (position: { x: number; y: number }) => ({
  x: Math.floor(position.x / 100),
  y: Math.floor(position.y / 100)
});
const positionForCell = (cell: { x: number; y: number }) => ({
  x: cell.x * 100 + 50,
  y: cell.y * 100 + 50
});

describe("strategic ship movement phase resolution", () => {
  it("moves a planned ship to its final cell, applies final facing, and does not spend OP twice", () => {
    const currentScene = scene();
    currentScene.ships = {
      ship: {
        ...createRegisteredShip("red", "CRUISER", "EAST"),
        plannedRoute: [{ x: 0, y: -1 }],
        globalMovementRemaining: 1,
        movementSpentThisTurn: true
      }
    };
    const positions = { ship: { x: 50, y: 50 } };

    const result = resolvePlannedShipRoutes(
      currentScene,
      items,
      positions,
      cellForPosition,
      positionForCell
    );

    expect(result).toEqual({ ok: true });
    expect(positions.ship).toEqual({ x: 50, y: -50 });
    expect(currentScene.ships?.ship).toMatchObject({
      facing: "NORTH",
      plannedRoute: [],
      globalMovementRemaining: 1,
      movementSpentThisTurn: true
    });
  });

  it("validates all planned routes before moving any ship", () => {
    const currentScene = scene();
    currentScene.ships = {
      ship: {
        ...createRegisteredShip("red", "CRUISER", "EAST"),
        plannedRoute: [{ x: 0, y: -1 }],
        globalMovementRemaining: 1,
        movementSpentThisTurn: true
      },
      broken: {
        ...createRegisteredShip("blue", "CRUISER", "EAST"),
        plannedRoute: [{ x: 2, y: 0 }],
        globalMovementRemaining: 2,
        movementSpentThisTurn: true
      }
    };
    const currentItems = {
      ...items,
      broken: { id: "broken", type: "IMAGE", position: { x: 50, y: 50 }, metadata: {} }
    };
    const positions = {
      ship: { x: 50, y: 50 },
      broken: { x: 50, y: 50 }
    };

    const result = resolvePlannedShipRoutes(
      currentScene,
      currentItems,
      positions,
      cellForPosition,
      positionForCell
    );

    expect(result).toEqual({ ok: false, reason: "NOT_ORTHOGONAL" });
    expect(positions.ship).toEqual({ x: 50, y: 50 });
    expect(currentScene.ships?.ship?.plannedRoute).toEqual([{ x: 0, y: -1 }]);
  });
});
