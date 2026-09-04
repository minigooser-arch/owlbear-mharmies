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
    participantShipIds: [],
    snapshots: {},
    initiative: [],
    roundNumber: 4,
    currentShipId: null,
    completedShipIdsThisRound: [],
    movementRemainingByShip: {},
    actionUsedByShip: {},
    exitedShipIds: [],
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
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "NAVAL_BATTLE" },
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
  it("keeps an active battle visible to the GM even when no registered participant ships remain", () => {
    const snapshot = buildRoleSafeSnapshot(input("GM", "gm"));
    expect(snapshot.activeNavalBattle).toEqual({
      id: "naval-1",
      roundNumber: 4,
      participantCount: 0,
      currentShipId: null
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
