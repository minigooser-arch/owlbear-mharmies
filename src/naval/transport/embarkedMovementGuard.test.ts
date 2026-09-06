import { describe, expect, it, vi } from "vitest";
import { ProductionEngine } from "../../background/application";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../../shared/constants";
import type { ArmyState, NavalSceneState, SceneItemRecord } from "../../shared/types";
import type { OwlbearPort } from "../../owlbear/sdkAdapter";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { embarkArmy } from "./transportRules";

function movingArmy(embarkedOnShipId: string | null = null): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "MOVING",
    overrides: {},
    route: [{ x: 150, y: 50 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 1,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(armyId: string): NavalSceneState {
  const transport = createRegisteredShip("red", "TRANSPORT", "EAST");
  transport.embarkedArmyId = armyId;
  return {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{
      id: "red",
      name: "Красные",
      color: "#f00",
      playerIds: [],
      leaderPlayerIds: [],
      stateId: null
    }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null },
        "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: { transport },
    transportEmbarkRequests: [],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    coordinatorLease: { connectionId: "coordinator", epoch: 1, expiresAt: Date.now() + 10_000 }
  };
}

describe("embarked army movement guard", () => {
  it("cancels the old land movement plan when an army embarks", () => {
    const transport = createRegisteredShip("red", "TRANSPORT", "EAST");
    const result = embarkArmy("transport", transport, "army", movingArmy());

    expect(result.army.status).toBe("PAUSED");
    expect(result.army.route).toEqual([]);
    expect(result.army.plannedRoute.cells).toEqual([]);
    expect(result.army.currentWaypointIndex).toBe(0);
    expect(result.army.segmentProgressCells).toBe(0);
  });

  it("does not advance a reciprocally embarked MOVING legacy army during background movement ticks", async () => {
    const armyId = "army";
    const army = movingArmy("transport");
    const currentScene = scene(armyId);
    const items: SceneItemRecord[] = [{
      id: armyId,
      type: "IMAGE",
      position: { x: 50, y: 50 },
      metadata: { [METADATA_KEYS.army]: army }
    }];
    const patchSceneItemMetadata = vi.fn(async () => undefined);
    const port = {
      getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(currentScene) }),
      patchSceneMetadata: async () => undefined,
      getSceneItems: async () => structuredClone(items),
      patchSceneItemMetadata,
      getGridDistance: async (from: { x: number; y: number }, to: { x: number; y: number }) =>
        Math.hypot(to.x - from.x, to.y - from.y) / 100,
      getGridDpi: async () => 100,
      snapGridCenter: async (position: { x: number; y: number }) => ({ ...position }),
      getLocalItems: async () => [],
      addLocalItem: async () => undefined,
      updateLocalItem: async () => undefined,
      deleteLocalItems: async () => undefined,
      createClone: () => { throw new Error("not used"); },
      send: async () => undefined,
      on: () => () => undefined,
      show: async () => undefined
    } as unknown as OwlbearPort;

    const engine = new ProductionEngine(port);
    engine.setCoordinator(true, "coordinator");
    await engine.movementTick();

    expect(patchSceneItemMetadata).not.toHaveBeenCalled();
  });
});
