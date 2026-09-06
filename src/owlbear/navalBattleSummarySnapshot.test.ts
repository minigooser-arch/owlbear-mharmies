import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { NavalBattleState, SceneState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

function activeBattle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }],
    participantShipIds: ["first", "second"],
    snapshots: {},
    initiative: [
      { shipId: "first", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "second", initialRoll: 14, bonus: 0, total: 14, tieBreakRolls: [] }
    ],
    roundNumber: 4,
    currentShipId: "second",
    completedShipIdsThisRound: ["first"],
    movementRemainingByShip: { first: 0, second: 2 },
    actionUsedByShip: { first: true, second: false },
    exitedShipIds: ["first"],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 7,
    startedAt: 1,
    revision: 9
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 12,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["player"], leaderPlayerIds: ["player"], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "POST_MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: activeBattle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

const input = (role: "GM" | "PLAYER", playerId: string) => ({
  role,
  playerId,
  scene: scene(),
  players: [],
  armies: [],
  ships: [],
  mapVisibleSourceIds: new Set<string>()
});

describe("GM-only naval battle summary", () => {
  it("keeps initiative and per-round status visible to the GM even if participant records are missing", () => {
    const snapshot = buildRoleSafeSnapshot(input("GM", "gm"));
    expect(snapshot.activeNavalBattle).toEqual({
      id: "naval-1",
      roundNumber: 4,
      participantCount: 2,
      currentShipId: "second",
      initiative: [
        { shipId: "first", total: 20 },
        { shipId: "second", total: 14 }
      ],
      completedShipIdsThisRound: ["first"],
      exitedShipIds: ["first"]
    });
  });

  it("does not expose the global naval battle summary to a player", () => {
    const current = scene();
    current.ships = { own: createRegisteredShip("red", "CRUISER", "EAST") };
    const snapshot = buildRoleSafeSnapshot({
      ...input("PLAYER", "player"),
      scene: current
    });
    expect(snapshot.activeNavalBattle).toBeUndefined();
  });
});
