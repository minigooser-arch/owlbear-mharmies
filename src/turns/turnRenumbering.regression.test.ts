import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { canRenumberTurn, renumberSceneTurn } from "./turnService";

function sceneFixture(): SceneState {
  return {
    version: 6,
    revision: 4,
    settings: {
      defaultDetectionRangeCells: 5,
      defaultSpeedCellsPerSecond: 1,
      defaultCollisionRangeCells: 1,
      defaultMaxRouteDistanceCells: 5,
      detectionMode: "INDEPENDENT",
      visibilityRecalculationMode: "ON_DROP",
      allowPlayersToCreateRoutes: true,
      allowPlayersToStartOwnArmies: false,
      movementUpdateRate: 10,
      visibilityUpdateRate: 10,
      interpolationEnabled: true
    },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 26, phase: "MOVEMENT" },
    ships: {
      ship: {
        version: 1,
        registered: true,
        sideId: "A",
        classId: "HOSPITAL",
        status: "READY",
        hp: 10,
        temporaryHp: 0,
        facing: "NORTH",
        plannedRoute: [{ x: 1, y: 0 }],
        plannedFacing: null,
        globalMovementRemaining: 3,
        movementSpentThisTurn: true,
        battleId: null,
        detectionOverride: null,
        embarkedArmyId: null,
        shoreBombardmentUsedOnTurn: 26,
        logisticsActionUsedOnTurn: 26,
        revision: 2
      }
    },
    navalBattleRequests: [{ id: "req", initiatingShipId: "ship", targetShipId: "enemy", createdOnTurn: 26 }],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: { B: { ship: 27 } }
  };
}

function armyFixture(): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "A",
    status: "READY",
    overrides: {},
    route: [{ x: 100, y: 0 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 27,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 4,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 26 },
    disband: { pending: true, requestedOnTurn: 26, requestedByPlayerId: "leader" },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 3
  };
}

describe("safe manual turn renumbering", () => {
  it("rebases all live turn-indexed state instead of invalidating it", () => {
    const result = renumberSceneTurn(sceneFixture(), { army: armyFixture() }, 1);

    expect(result.scene.turn.turnNumber).toBe(1);
    expect(result.armies.army?.plannedRoute.executeOnTurn).toBe(2);
    expect(result.armies.army?.plannedRoute.requiresReplan).toBe(false);
    expect(result.armies.army?.supply.checkedOnTurn).toBe(1);
    expect(result.armies.army?.disband.requestedOnTurn).toBe(1);
    expect(result.scene.ships?.ship?.shoreBombardmentUsedOnTurn).toBe(1);
    expect(result.scene.ships?.ship?.logisticsActionUsedOnTurn).toBe(1);
    expect(result.scene.navalBattleRequests?.[0]?.createdOnTurn).toBe(1);
    expect(result.scene.navalRevealUntilTurn?.B?.ship).toBe(2);
    expect(result.scene.ships?.ship?.plannedRoute).toEqual([{ x: 1, y: 0 }]);
  });

  it("keeps already-expired markers before the new current turn", () => {
    const scene = sceneFixture();
    const ship = scene.ships?.ship;
    if (!ship) throw new Error("fixture ship missing");
    ship.shoreBombardmentUsedOnTurn = 25;
    ship.logisticsActionUsedOnTurn = 25;
    scene.navalRevealUntilTurn = { B: { ship: 25 } };
    const army = armyFixture();
    army.supply.checkedOnTurn = 25;

    const result = renumberSceneTurn(scene, { army }, 1);

    expect(result.scene.ships?.ship?.shoreBombardmentUsedOnTurn).toBe(0);
    expect(result.scene.ships?.ship?.logisticsActionUsedOnTurn).toBe(0);
    expect(result.scene.navalRevealUntilTurn?.B?.ship).toBe(0);
    expect(result.armies.army?.supply.checkedOnTurn).toBe(0);
  });

  it("allows renumbering only in movement with no active naval battle", () => {
    const scene = sceneFixture();
    expect(canRenumberTurn(scene)).toBe(true);

    expect(canRenumberTurn({ ...scene, turn: { ...scene.turn, phase: "POST_MOVEMENT" } })).toBe(false);
    expect(canRenumberTurn({
      ...scene,
      activeNavalBattle: {
        version: 1,
        id: "battle",
        requestId: null,
        initiatorSideId: "A",
        areaCells: [],
        participantShipIds: [],
        snapshots: {},
        initiative: [],
        roundNumber: 1,
        currentShipId: null,
        completedShipIdsThisRound: [],
        movementRemainingByShip: {},
        actionUsedByShip: {},
        exitedShipIds: [],
        status: "ACTIVE",
        events: [],
        startedOnTurn: 26,
        startedAt: 0,
        revision: 1
      }
    })).toBe(false);
  });
});
