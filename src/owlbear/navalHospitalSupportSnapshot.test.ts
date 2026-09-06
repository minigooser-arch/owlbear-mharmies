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

function ship(sideId: string, classId: ShipState["classId"]): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, "EAST"),
    status: "IN_NAVAL_BATTLE",
    battleId: "naval-1"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }],
    participantShipIds: ["hospital", "friendly", "visible-enemy", "hidden-enemy"],
    snapshots: {},
    initiative: [
      { shipId: "hospital", initialRoll: 15, bonus: 0, total: 15, tieBreakRolls: [] },
      { shipId: "friendly", initialRoll: 14, bonus: 0, total: 14, tieBreakRolls: [] },
      { shipId: "visible-enemy", initialRoll: 13, bonus: 0, total: 13, tieBreakRolls: [] },
      { shipId: "hidden-enemy", initialRoll: 12, bonus: 0, total: 12, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "hospital",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { hospital: 4, friendly: 3, "visible-enemy": 3, "hidden-enemy": 3 },
    actionUsedByShip: { hospital: false, friendly: false, "visible-enemy": false, "hidden-enemy": false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 5,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
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
      hospital: ship("red", "HOSPITAL"),
      friendly: { ...ship("red", "CRUISER"), hp: 15 },
      "visible-enemy": { ...ship("blue", "CRUISER"), hp: 15 },
      "hidden-enemy": { ...ship("blue", "CRUISER"), hp: 15 }
    },
    navalBattleRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("role-safe hospital support snapshot", () => {
  it("exposes only non-self living battle targets already visible to the leader", () => {
    const current = scene();
    const snapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "leader",
      scene: current,
      players: [],
      armies: [],
      ships: Object.entries(current.ships ?? {}).map(([id, state]) => ({ item: item(id), state })),
      mapVisibleSourceIds: new Set(["visible-enemy"])
    });

    const hospital = snapshot.ships?.find((candidate) => candidate.id === "hospital");
    expect(hospital?.hospitalSupportTargets?.map((target) => target.id)).toEqual([
      "friendly",
      "visible-enemy"
    ]);
  });

  it("does not expose support targets when the hospital ship is not current", () => {
    const current = scene();
    if (current.activeNavalBattle) current.activeNavalBattle.currentShipId = "friendly";
    const snapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "leader",
      scene: current,
      players: [],
      armies: [],
      ships: Object.entries(current.ships ?? {}).map(([id, state]) => ({ item: item(id), state })),
      mapVisibleSourceIds: new Set(["visible-enemy"])
    });

    expect(snapshot.ships?.find((candidate) => candidate.id === "hospital")?.hospitalSupportTargets).toEqual([]);
  });
});
