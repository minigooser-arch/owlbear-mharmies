import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { completeTurn } from "./turnService";

function sceneWithTransport(linkArmy = true): SceneState {
  const transport = {
    ...createRegisteredShip("red", "TRANSPORT", "EAST"),
    embarkedArmyId: linkArmy ? "army" : null
  };
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "red-state" }],
    states: [{ id: "red-state", name: "Red State", rulingFactionId: "red", active: true }],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "0,0": {
          terrainId: null,
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: "blue",
          deFactoStateId: "red-state"
        },
        "1,0": {
          terrainId: null,
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: "blue",
          deFactoStateId: "blue"
        }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: { transport },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function embarkedArmy(): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 4,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 0, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: false, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: "transport",
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 2
  };
}

it("skips land supply and encirclement damage for a reciprocally embarked army", () => {
  const result = completeTurn(sceneWithTransport(true), { army: embarkedArmy() }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-04T12:00:00.000Z"),
    armyCells: { army: { x: 0, y: 0 } }
  });

  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.armies.army?.supply).toEqual({ supplied: true, checkedOnTurn: 2 });
  expect(result.armies.army?.health.hp).toBe(50);
});

it("does not treat an orphan embarkedOnShipId as a valid embarkation", () => {
  const result = completeTurn(sceneWithTransport(false), { army: embarkedArmy() }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-04T12:00:00.000Z"),
    armyCells: { army: { x: 0, y: 0 } }
  });

  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.armies.army?.supply).toEqual({ supplied: false, checkedOnTurn: 2 });
  expect(result.armies.army?.health.hp).toBe(45);
});
