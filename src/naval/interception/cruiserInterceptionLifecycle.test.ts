import { describe, expect, it } from "vitest";
import type { NavalBattleState, NavalSceneState, ShipState } from "../../shared/types";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import { confirmNavalShipExit } from "../battle/navalExit";
import { createRegisteredShip, destroyShip } from "../ships/shipLifecycle";

function battle(currentShipId: string): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["cruiser", "other"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "other", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 3,
    currentShipId,
    completedShipIdsThisRound: currentShipId === "other" ? ["cruiser"] : [],
    movementRemainingByShip: { cruiser: 2, other: 2 },
    actionUsedByShip: { cruiser: false, other: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 2 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 4
  };
}

function ship(sideId: string, classId: ShipState["classId"]): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, "NORTH"),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function ships(): Record<string, ShipState> {
  return {
    cruiser: ship("red", "CRUISER"),
    other: ship("blue", "BATTLESHIP")
  };
}

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 5,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: ships(),
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: battle("other"),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("cruiser interception lifecycle cleanup", () => {
  it("removes the active zone when the cruiser exits", () => {
    const currentBattle = battle("cruiser");
    const result = confirmNavalShipExit(currentBattle, ships(), "cruiser");
    expect(result.interceptions?.cruiser).toBeUndefined();
  });

  it("removes the active zone when the cruiser is destroyed", () => {
    const result = destroyShip(scene(), "cruiser");
    expect(result.destroyed).toBe(true);
    expect(result.scene.activeNavalBattle?.interceptions?.cruiser).toBeUndefined();
  });
});
