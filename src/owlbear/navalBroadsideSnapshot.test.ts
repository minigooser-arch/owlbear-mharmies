import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { NavalBattleState, SceneItemRecord, SceneState, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

const item = (id: string): SceneItemRecord => ({ id, type: "IMAGE", name: id, position: { x: 0, y: 0 }, metadata: {} });

function battleShip(sideId: string, classId: ShipState["classId"] = "CRUISER"): ShipState {
  return { ...createRegisteredShip(sideId, classId, "NORTH"), status: "IN_NAVAL_BATTLE", battleId: "naval-1" };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    participantShipIds: ["attacker", "enemy", "ally", "exited"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 0, total: 20, tieBreakRolls: [] },
      { shipId: "enemy", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] },
      { shipId: "ally", initialRoll: 9, bonus: 0, total: 9, tieBreakRolls: [] },
      { shipId: "exited", initialRoll: 8, bonus: 0, total: 8, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 5, enemy: 3, ally: 3, exited: 3 },
    actionUsedByShip: { attacker: false, enemy: false, ally: false, exited: false },
    exitedShipIds: ["exited"],
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
      { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null },
      { id: "green", name: "Зелёные", color: "#0a0", playerIds: ["green"], leaderPlayerIds: ["green"], stateId: null }
    ],
    states: [], relations: { red: { green: "ALLY", blue: "ENEMY" } }, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN), gridMap: { version: 1, revision: 0, cells: {} }, wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: {
      attacker: battleShip("red"),
      enemy: battleShip("blue", "BATTLESHIP"),
      ally: battleShip("green", "IRONCLAD"),
      exited: battleShip("blue")
    },
    navalBattleRequests: [], activeNavalBattle: battle(), navalBattleHistory: [], navalRevealUntilTurn: {}
  };
}

function snapshot(playerId: string, role: "GM" | "PLAYER" = "PLAYER") {
  const current = scene();
  return buildRoleSafeSnapshot({
    role,
    playerId,
    scene: current,
    players: [], armies: [],
    ships: Object.entries(current.ships ?? {}).map(([id, state]) => ({ item: item(id), state })),
    mapVisibleSourceIds: new Set(["enemy", "ally", "exited"])
  });
}

describe("role-safe naval broadside targets", () => {
  it("gives the active side leader minimal living non-exited battle targets", () => {
    const attacker = snapshot("leader").ships?.find((ship) => ship.id === "attacker");
    expect(attacker?.broadsideTargets).toEqual([
      { id: "enemy", name: "enemy", sideId: "blue", sideName: "Синие" },
      { id: "ally", name: "ally", sideId: "green", sideName: "Зелёные" }
    ]);
    expect(attacker?.broadsideTargets?.[0]).not.toHaveProperty("hp");
    expect(attacker?.broadsideTargets?.[0]).not.toHaveProperty("classId");
  });

  it("does not expose broadside controls to an ordinary member", () => {
    expect(snapshot("member").ships?.find((ship) => ship.id === "attacker")?.broadsideTargets).toEqual([]);
  });

  it("gives the GM the same authoritative target choices", () => {
    expect(snapshot("gm", "GM").ships?.find((ship) => ship.id === "attacker")?.broadsideTargets?.map((target) => target.id)).toEqual(["enemy", "ally"]);
  });
});
