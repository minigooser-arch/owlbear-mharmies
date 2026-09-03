import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type {
  GridCellCoord,
  NavalBattleShipSnapshot,
  NavalSceneState,
  ShipClassId,
  ShipState
} from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { completeNavalBattle, startNavalBattle } from "./navalBattleLifecycle";

function ship(sideId: string, classId: ShipClassId): ShipState {
  return createRegisteredShip(sideId, classId, "NORTH");
}

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 10,
    settings: DEFAULT_SETTINGS,
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: DEFAULT_TERRAIN,
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, turnNumber: 4 },
    ships: {
      red: ship("red", "CRUISER"),
      blue: ship("blue", "BATTLESHIP")
    },
    navalBattleRequests: [
      { id: "request", initiatingShipId: "red", targetShipId: "blue", createdOnTurn: 4 },
      { id: "other", initiatingShipId: "blue", targetShipId: "red", createdOnTurn: 4 }
    ],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function snapshots(): Record<string, NavalBattleShipSnapshot> {
  return {
    red: {
      shipId: "red",
      strategicCell: { x: 4, y: 5 },
      strategicPosition: { x: 400, y: 500 },
      strategicFacing: "NORTH"
    },
    blue: {
      shipId: "blue",
      strategicCell: { x: 5, y: 5 },
      strategicPosition: { x: 500, y: 500 },
      strategicFacing: "WEST"
    }
  };
}

function areaCells(): GridCellCoord[] {
  return [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }];
}

function rolls(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error("No more rolls");
    index += 1;
    return value;
  };
}

describe("naval battle lifecycle", () => {
  it("starts a battle, rolls initiative once, initializes round budgets, and marks participant ships", () => {
    const result = startNavalBattle(scene(), {
      battleId: "battle-1",
      requestId: "request",
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(18, 10)
    });

    expect(result.turn.phase).toBe("NAVAL_BATTLE");
    expect(result.activeNavalBattle).toMatchObject({
      id: "battle-1",
      requestId: "request",
      initiatorSideId: "red",
      participantShipIds: ["red", "blue"],
      roundNumber: 1,
      currentShipId: "red",
      movementRemainingByShip: { red: 3, blue: 2 },
      actionUsedByShip: { red: false, blue: false },
      startedOnTurn: 4,
      startedAt: 123,
      status: "ACTIVE"
    });
    expect(result.activeNavalBattle?.initiative).toEqual([
      { shipId: "red", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "blue", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ]);
    expect(result.ships.red).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "battle-1" });
    expect(result.ships.blue).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "battle-1" });
  });

  it("consumes only the matching battle request and reveals opposing participants through the next global-turn boundary", () => {
    const result = startNavalBattle(scene(), {
      battleId: "battle-1",
      requestId: "request",
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(18, 10)
    });

    expect(result.navalBattleRequests.map((request) => request.id)).toEqual(["other"]);
    expect(result.navalRevealUntilTurn).toEqual({
      red: { blue: 5 },
      blue: { red: 5 }
    });
  });

  it("rejects starting a second simultaneous naval battle", () => {
    const input = scene();
    const active = startNavalBattle(input, {
      battleId: "battle-1",
      requestId: null,
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(18, 10)
    });

    expect(() => startNavalBattle(active, {
      battleId: "battle-2",
      requestId: null,
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 124,
      rollD20: rolls(18, 10)
    })).toThrow("Naval battle already active");
  });

  it("rejects unavailable participants and missing strategic snapshots", () => {
    const missing = scene();
    delete missing.ships.blue;
    expect(() => startNavalBattle(missing, {
      battleId: "battle-1",
      requestId: null,
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(18, 10)
    })).toThrow("Missing naval battle participant: blue");

    const dead = scene();
    dead.ships.blue = { ...dead.ships.blue, hp: 0 };
    expect(() => startNavalBattle(dead, {
      battleId: "battle-1",
      requestId: null,
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(18, 10)
    })).toThrow("Destroyed naval battle participant: blue");

    const missingSnapshot = snapshots();
    delete missingSnapshot.blue;
    expect(() => startNavalBattle(scene(), {
      battleId: "battle-1",
      requestId: null,
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: missingSnapshot,
      startedAt: 123,
      rollD20: rolls(18, 10)
    })).toThrow("Missing naval battle snapshot: blue");
  });

  it("requires the initiating ship to be one of the participants", () => {
    expect(() => startNavalBattle(scene(), {
      battleId: "battle-1",
      requestId: null,
      initiatingShipId: "red",
      participantShipIds: ["blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(10)
    })).toThrow("Initiating ship must participate");
  });

  it("completes and archives the battle, releases surviving ships, restores movement phase, and preserves strategic snapshots", () => {
    const active = startNavalBattle(scene(), {
      battleId: "battle-1",
      requestId: "request",
      initiatingShipId: "red",
      participantShipIds: ["red", "blue"],
      areaCells: areaCells(),
      snapshots: snapshots(),
      startedAt: 123,
      rollD20: rolls(18, 10)
    });

    const result = completeNavalBattle(active);
    expect(result.activeNavalBattle).toBeNull();
    expect(result.turn.phase).toBe("MOVEMENT");
    expect(result.ships.red).toMatchObject({ status: "READY", battleId: null });
    expect(result.ships.blue).toMatchObject({ status: "READY", battleId: null });
    expect(result.navalBattleHistory).toHaveLength(1);
    expect(result.navalBattleHistory[0]).toMatchObject({
      id: "battle-1",
      status: "COMPLETED",
      currentShipId: null,
      snapshots: snapshots()
    });
  });
});
