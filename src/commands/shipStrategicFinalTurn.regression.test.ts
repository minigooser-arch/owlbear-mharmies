import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState, TerrainType } from "../shared/types";
import { applyShipStrategicRouteCommand } from "./shipStrategicRouteCommand";
import { validateArmyCommand } from "./commandValidation";
import type { CommandState } from "./commandProcessor";

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

function state(): CommandState {
  const scene: SceneState = {
    version: 6,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
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
      revision: 1,
      cells: {
        "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: { ship: createRegisteredShip("red", "CRUISER", "EAST") },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  return {
    scene,
    armies: {},
    barriers: {},
    items: {
      ship: { id: "ship", type: "IMAGE", position: { x: 0.5, y: 0.5 }, metadata: {} }
    },
    positions: { ship: { x: 0.5, y: 0.5 } }
  };
}

function plannedFacingOf(commandState: CommandState): string | null | undefined {
  return (commandState.scene.ships?.ship as unknown as { plannedFacing?: string | null } | undefined)?.plannedFacing;
}

describe("strategic ship final turn", () => {
  it("accepts a rotation-only SET_SHIP_ROUTE payload", () => {
    const raw = {
      protocolVersion: 4,
      requestId: "turn-only",
      senderPlayerId: "leader",
      senderConnectionId: "leader-connection",
      expectedRevision: 1,
      type: "SET_SHIP_ROUTE",
      shipId: "ship",
      startCell: { x: 0, y: 0 },
      cells: [],
      finalFacing: "WEST"
    };

    expect(validateArmyCommand(raw)).toMatchObject({
      ok: true,
      command: { type: "SET_SHIP_ROUTE", cells: [], finalFacing: "WEST" }
    });
  });

  it("plans a 180 degree turn in place for two OP without moving", () => {
    const commandState = state();
    const ship = commandState.scene.ships?.ship;
    if (!ship) throw new Error("Missing ship fixture");
    const beforeMovement = ship.globalMovementRemaining;

    const reason = applyShipStrategicRouteCommand(
      commandState,
      {
        shipId: "ship",
        startCell: { x: 0, y: 0 },
        cells: [],
        finalFacing: "WEST"
      } as unknown as Parameters<typeof applyShipStrategicRouteCommand>[1],
      () => ({ x: 0, y: 0 })
    );

    expect(reason).toBeUndefined();
    expect(commandState.scene.ships?.ship?.plannedRoute).toEqual([]);
    expect(plannedFacingOf(commandState)).toBe("WEST");
    expect(commandState.scene.ships?.ship?.globalMovementRemaining).toBe(beforeMovement - 2);
    expect(commandState.scene.ships?.ship?.movementSpentThisTurn).toBe(true);
    expect(commandState.positions?.ship).toEqual({ x: 0.5, y: 0.5 });
  });

  it("charges a final 90 degree turn after movement and rejects it when OP are insufficient", () => {
    const commandState = state();
    const ship = commandState.scene.ships?.ship;
    if (!ship) throw new Error("Missing ship fixture");
    ship.globalMovementRemaining = 2;

    const accepted = applyShipStrategicRouteCommand(
      commandState,
      {
        shipId: "ship",
        startCell: { x: 0, y: 0 },
        cells: [{ x: 1, y: 0 }],
        finalFacing: "NORTH"
      } as unknown as Parameters<typeof applyShipStrategicRouteCommand>[1],
      () => ({ x: 0, y: 0 })
    );

    expect(accepted).toBeUndefined();
    expect(commandState.scene.ships?.ship?.plannedRoute).toEqual([{ x: 1, y: 0 }]);
    expect(plannedFacingOf(commandState)).toBe("NORTH");
    expect(commandState.scene.ships?.ship?.globalMovementRemaining).toBe(0);

    const insufficient = state();
    const insufficientShip = insufficient.scene.ships?.ship;
    if (!insufficientShip) throw new Error("Missing ship fixture");
    insufficientShip.globalMovementRemaining = 1;
    const rejected = applyShipStrategicRouteCommand(
      insufficient,
      {
        shipId: "ship",
        startCell: { x: 0, y: 0 },
        cells: [{ x: 1, y: 0 }],
        finalFacing: "NORTH"
      } as unknown as Parameters<typeof applyShipStrategicRouteCommand>[1],
      () => ({ x: 0, y: 0 })
    );

    expect(rejected).toBe("INSUFFICIENT_MOVEMENT_POINTS");
  });
});
