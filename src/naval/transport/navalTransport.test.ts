import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { ArmyState, GridCellCoord, NavalSceneState } from "../../shared/types";
import {
  embarkArmy,
  disembarkArmy,
  validateEmbarkArmy,
  validateDisembarkArmy
} from "./navalTransport";

function army(sideId = "red"): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 0,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      defaultTerrainId: "land",
      types: {
        land: { id: "land", name: "Суша", movementCostUnits: 2, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true },
        sea: { id: "sea", name: "Море", movementCostUnits: 2, enabled: true, movementDomains: ["SEA"], blocksNavalLos: false },
        canal: { id: "canal", name: "Канал", movementCostUnits: 2, enabled: true, movementDomains: ["LAND", "SEA"], blocksNavalLos: false }
      }
    },
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "2,0": { terrainId: "canal", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "3,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function transport() {
  return createRegisteredShip("red", "TRANSPORT", "EAST");
}

const landCell: GridCellCoord = { x: 0, y: 0 };
const seaCell: GridCellCoord = { x: 1, y: 0 };
const canalCell: GridCellCoord = { x: 2, y: 0 };

describe("naval transport core", () => {
  it("embarks from adjacent LAND and exhausts transport movement", () => {
    const result = embarkArmy({
      scene: scene(),
      shipId: "transport",
      ship: transport(),
      shipCell: seaCell,
      armyId: "army",
      army: army(),
      armyCell: landCell
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ship).toMatchObject({
      embarkedArmyId: "army",
      globalMovementRemaining: 0,
      movementSpentThisTurn: true,
      logisticsActionUsedOnTurn: 4
    });
    expect(result.army.embarkedOnShipId).toBe("transport");
  });

  it("allows embark on the same LAND+SEA canal cell", () => {
    expect(validateEmbarkArmy({
      scene: scene(),
      shipId: "transport",
      ship: transport(),
      shipCell: canalCell,
      armyId: "army",
      army: army(),
      armyCell: canalCell
    })).toEqual({ ok: true });
  });

  it("rejects non-transport ships, non-MOVEMENT phase, and an army that already moved", () => {
    const cruiser = createRegisteredShip("red", "CRUISER", "EAST");
    expect(validateEmbarkArmy({ scene: scene(), shipId: "ship", ship: cruiser, shipCell: seaCell, armyId: "army", army: army(), armyCell: landCell })).toEqual({ ok: false, reason: "SHIP_NOT_TRANSPORT" });

    const battleScene = scene();
    battleScene.turn.phase = "NAVAL_BATTLE";
    expect(validateEmbarkArmy({ scene: battleScene, shipId: "transport", ship: transport(), shipCell: seaCell, armyId: "army", army: army(), armyCell: landCell })).toEqual({ ok: false, reason: "WRONG_PHASE" });

    const movedArmy = army();
    movedArmy.movement.remainingUnits = 8;
    expect(validateEmbarkArmy({ scene: scene(), shipId: "transport", ship: transport(), shipCell: seaCell, armyId: "army", army: movedArmy, armyCell: landCell })).toEqual({ ok: false, reason: "ARMY_ALREADY_MOVED" });
  });

  it("rejects embark geometry outside adjacent LAND or same canal", () => {
    expect(validateEmbarkArmy({
      scene: scene(),
      shipId: "transport",
      ship: transport(),
      shipCell: { x: 3, y: 0 },
      armyId: "army",
      army: army(),
      armyCell: landCell
    })).toEqual({ ok: false, reason: "INVALID_EMBARK_POSITION" });
  });

  it("disembarks to adjacent LAND, clears reciprocal links, and locks army movement", () => {
    const ship = transport();
    ship.embarkedArmyId = "army";
    const embarked = army();
    embarked.embarkedOnShipId = "transport";

    const result = disembarkArmy({
      scene: scene(),
      shipId: "transport",
      ship,
      shipCell: seaCell,
      armyId: "army",
      army: embarked,
      destinationCell: landCell
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ship.embarkedArmyId).toBeNull();
    expect(result.ship.logisticsActionUsedOnTurn).toBe(4);
    expect(result.army.embarkedOnShipId).toBeNull();
    expect(result.army.movement.remainingUnits).toBe(0);
    expect(result.enemyArmyId).toBeNull();
  });

  it("allows same-cell canal disembark and rejects occupied non-enemy destination", () => {
    const ship = transport();
    ship.embarkedArmyId = "army";
    const embarked = army();
    embarked.embarkedOnShipId = "transport";

    expect(validateDisembarkArmy({
      scene: scene(), shipId: "transport", ship, shipCell: canalCell,
      armyId: "army", army: embarked, destinationCell: canalCell
    })).toEqual({ ok: true, enemyArmyId: null });

    expect(validateDisembarkArmy({
      scene: scene(), shipId: "transport", ship, shipCell: seaCell,
      armyId: "army", army: embarked, destinationCell: landCell,
      occupant: { armyId: "friendly", sideId: "red", enemy: false }
    })).toEqual({ ok: false, reason: "DESTINATION_OCCUPIED" });
  });

  it("surfaces enemy occupancy as an immediate land-battle outcome", () => {
    const ship = transport();
    ship.embarkedArmyId = "army";
    const embarked = army();
    embarked.embarkedOnShipId = "transport";

    const result = disembarkArmy({
      scene: scene(), shipId: "transport", ship, shipCell: seaCell,
      armyId: "army", army: embarked, destinationCell: landCell,
      occupant: { armyId: "enemy", sideId: "blue", enemy: true }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enemyArmyId).toBe("enemy");
    expect(result.army.movement.remainingUnits).toBe(0);
  });
});
