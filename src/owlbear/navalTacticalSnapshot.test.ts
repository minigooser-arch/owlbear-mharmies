import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { NavalBattleState, SceneItemRecord, SceneState, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

const item = (id: string): SceneItemRecord => ({
  id,
  type: "IMAGE",
  name: id,
  position: { x: 0, y: 0 },
  metadata: {}
});

function ship(sideId: string, battleId: string): ShipState {
  return {
    ...createRegisteredShip(sideId, "CRUISER", "EAST"),
    status: "IN_NAVAL_BATTLE",
    battleId
  };
}

function activeBattle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }],
    participantShipIds: ["red-ship", "blue-ship"],
    snapshots: {},
    initiative: [
      { shipId: "red-ship", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] },
      { shipId: "blue-ship", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [] }
    ],
    roundNumber: 2,
    currentShipId: "red-ship",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { "red-ship": 1, "blue-ship": 3 },
    actionUsedByShip: { "red-ship": false, "blue-ship": true },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 7
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 5,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: {
      "red-ship": ship("red", "naval-1"),
      "blue-ship": ship("blue", "naval-1")
    },
    navalBattleRequests: [],
    activeNavalBattle: activeBattle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("role-safe naval tactical snapshot", () => {
  it("exposes only the member-side ship and only that ship's tactical turn fields", () => {
    const current = scene();
    const snapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "leader",
      scene: current,
      players: [],
      armies: [],
      ships: [
        { item: item("red-ship"), state: current.ships?.["red-ship"] as ShipState },
        { item: item("blue-ship"), state: current.ships?.["blue-ship"] as ShipState }
      ],
      mapVisibleSourceIds: new Set(["blue-ship"])
    });

    expect(snapshot.ships?.map((shipView) => shipView.id)).toEqual(["red-ship"]);
    expect(snapshot.ships?.[0]).toMatchObject({
      navalRoundNumber: 2,
      isCurrentNavalTurn: true,
      navalMovementRemaining: 1,
      navalActionUsed: false
    });
  });

  it("lets the GM inspect per-ship tactical state without changing ordinary ship visibility rules", () => {
    const current = scene();
    const snapshot = buildRoleSafeSnapshot({
      role: "GM",
      playerId: "gm",
      scene: current,
      players: [],
      armies: [],
      ships: [
        { item: item("red-ship"), state: current.ships?.["red-ship"] as ShipState },
        { item: item("blue-ship"), state: current.ships?.["blue-ship"] as ShipState }
      ],
      mapVisibleSourceIds: new Set()
    });

    expect(snapshot.ships).toHaveLength(2);
    expect(snapshot.ships?.find((candidate) => candidate.id === "red-ship")).toMatchObject({
      navalRoundNumber: 2,
      isCurrentNavalTurn: true,
      navalMovementRemaining: 1,
      navalActionUsed: false
    });
    expect(snapshot.ships?.find((candidate) => candidate.id === "blue-ship")).toMatchObject({
      navalRoundNumber: 2,
      isCurrentNavalTurn: false,
      navalMovementRemaining: 3,
      navalActionUsed: true
    });
  });
});
