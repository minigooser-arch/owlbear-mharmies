import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { RawExtensionSnapshot, ShipView } from "../ui/state/useExtensionState";
import { semanticSnapshotEqual, semanticValueEqual } from "./snapshotEquality";

const ship: ShipView = {
  id: "red-cruiser",
  name: "Аврора",
  sideId: "red",
  sideName: "Red",
  classId: "CRUISER",
  className: "Крейсер",
  status: "IN_NAVAL_BATTLE",
  hp: 25,
  maxHp: 25,
  temporaryHp: 0,
  armor: 1,
  movementMax: 3,
  movementRemaining: 3,
  plannedRouteCellCount: 0,
  facing: "NORTH",
  normalDice: 2,
  normalRangeMin: 1,
  normalRangeMax: 2,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6,
  navalRoundNumber: 1,
  isCurrentNavalTurn: true,
  navalMovementRemaining: 3,
  navalActionUsed: false,
  navalExited: false,
  broadsideTargets: []
};

function snapshot(overrides: Partial<RawExtensionSnapshot> = {}): RawExtensionSnapshot {
  return {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "GM",
    playerId: "gm",
    players: [
      { id: "p1", name: "One", color: "#111", role: "PLAYER", connected: true },
      { id: "p2", name: "Two", color: "#222", role: "PLAYER", connected: true }
    ],
    memberSideIds: new Set(["red", "blue"]),
    leaderSideIds: new Set(["red", "blue"]),
    mapVisibleSourceIds: new Set(["army-1"]),
    armies: [
      {
        id: "army-1",
        name: "First",
        sideId: "red",
        sideName: "Red",
        status: "READY",
        route: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        movementMaxUnits: 10, movementRemainingUnits: 8, routeCostUnits: 2, routeCellCount: 2, routeRequiresReplan: false, atWar: false, healthHp: 50, healthMaxHp: 50, supplied: true, supplyCheckedOnTurn: 1, disbandPending: false
      },
      {
        id: "army-2",
        name: "Second",
        sideId: "blue",
        sideName: "Blue",
        status: "MOVING",
        route: [],
        movementMaxUnits: 10, movementRemainingUnits: 6, routeCostUnits: 3, routeCellCount: 1, routeRequiresReplan: false, atWar: true, healthHp: 45, healthMaxHp: 50, supplied: false, supplyCheckedOnTurn: 1, disbandPending: false
      }
    ],
    ships: [ship],
    navalRequestTargets: [],
    pendingNavalBattleRequests: [],
    transportEmbarkTargets: [],
    pendingTransportEmbarkRequests: [],
    activeNavalBattle: {
      id: "naval-1",
      roundNumber: 1,
      participantCount: 2,
      currentShipId: "red-cruiser",
      initiative: [{ shipId: "red-cruiser", total: 18 }, { shipId: "blue-cruiser", total: 12 }],
      completedShipIdsThisRound: [],
      exitedShipIds: []
    },
    sides: [
      {
        id: "red",
        name: "Red",
        color: "#f00",
        playerIds: ["p1", "p2"],
        leaderPlayerIds: ["p1", "p2"],
        stateId: null
      },
      {
        id: "blue",
        name: "Blue",
        color: "#00f",
        playerIds: [],
        leaderPlayerIds: [],
        stateId: null
      }
    ],
    states: [],
    relations: {
      red: { blue: "ENEMY", red: "ALLY" },
      blue: { red: "ENEMY", blue: "ALLY" }
    },
    battleGroups: [
      { battleId: "battle-1", name: "Bridge", participantIds: ["army-1", "army-2"], revision: 1 },
      { battleId: "battle-2", name: "Hill", participantIds: ["army-3"], revision: 1 }
    ],
    settings: { ...DEFAULT_SETTINGS },
    terrain: structuredClone(DEFAULT_TERRAIN),
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ...overrides
  };
}

describe("semantic value equality", () => {
  it("compares maps and sets without insertion order but keeps array order meaningful", () => {
    expect(semanticValueEqual(
      new Map<string, unknown>([["a", { value: 1 }], ["b", new Set([2, 3])]]),
      new Map<string, unknown>([["b", new Set([3, 2])], ["a", { value: 1 }]])
    )).toBe(true);
    expect(semanticValueEqual([{ x: 1 }, { x: 2 }], [{ x: 1 }, { x: 2 }])).toBe(true);
    expect(semanticValueEqual([{ x: 1 }, { x: 2 }], [{ x: 2 }, { x: 1 }])).toBe(false);
  });
});

describe("semantic snapshot equality", () => {
  it("ignores reference and collection-order churn where domain order is irrelevant", () => {
    const left = snapshot();
    const right = snapshot({
      players: [...left.players].reverse().map((player) => ({ ...player })),
      memberSideIds: new Set(["blue", "red"]),
      leaderSideIds: new Set(["blue", "red"]),
      mapVisibleSourceIds: new Set(["unrelated-map-clone"]),
      armies: [...left.armies].reverse().map((army) => ({
        ...army,
        route: army.route.map((point) => ({ ...point }))
      })),
      ships: [...(left.ships ?? [])].reverse().map((candidate) => ({ ...candidate })),
      sides: [...left.sides].reverse().map((side) => ({
        ...side,
        playerIds: [...side.playerIds].reverse(),
        leaderPlayerIds: [...side.leaderPlayerIds].reverse()
      })),
      states: [],
      relations: {
        blue: { blue: "ALLY", red: "ENEMY" },
        red: { red: "ALLY", blue: "ENEMY" }
      },
      battleGroups: [...left.battleGroups].reverse().map((battle) => ({
        ...battle,
        participantIds: [...battle.participantIds].reverse(),
        revision: battle.revision + 10
      })),
      settings: { ...left.settings }
    });

    expect(semanticSnapshotEqual(left, right)).toBe(true);
  });

  it("treats route order and rendered fields as meaningful", () => {
    const left = snapshot();
    const reversedRoute = left.armies.map((army) => army.id === "army-1"
      ? { ...army, route: [...army.route].reverse() }
      : army);
    const renamedBattle = left.battleGroups.map((battle) => battle.battleId === "battle-1"
      ? { ...battle, name: "Ford" }
      : battle);

    expect(semanticSnapshotEqual(left, snapshot({ armies: reversedRoute }))).toBe(false);
    expect(semanticSnapshotEqual(left, snapshot({ battleGroups: renamedBattle }))).toBe(false);
    expect(semanticSnapshotEqual(left, snapshot({
      settings: { ...left.settings, defaultMaxRouteDistanceCells: 99 }
    }))).toBe(false);
  });

  it("treats ship hp and tactical state changes as semantically meaningful", () => {
    const left = snapshot();
    expect(semanticSnapshotEqual(left, snapshot({
      ships: [{ ...ship, hp: ship.hp - 4, navalActionUsed: true }]
    }))).toBe(false);
  });

  it("treats naval initiative, round and current ship changes as semantically meaningful", () => {
    const left = snapshot();
    expect(semanticSnapshotEqual(left, snapshot({
      activeNavalBattle: {
        ...left.activeNavalBattle!,
        roundNumber: 2,
        currentShipId: "blue-cruiser",
        completedShipIdsThisRound: ["red-cruiser"]
      }
    }))).toBe(false);
  });

  it("treats naval requests and role-safe target changes as semantically meaningful", () => {
    const left = snapshot();
    expect(semanticSnapshotEqual(left, snapshot({
      pendingNavalBattleRequests: [{ id: "request-1", initiatingShipId: "red-cruiser", targetShipId: "blue-cruiser", createdOnTurn: 1 }]
    }))).toBe(false);
    expect(semanticSnapshotEqual(left, snapshot({
      navalRequestTargets: [{ id: "blue-cruiser", name: "Варяг", sideId: "blue", sideName: "Blue" }]
    }))).toBe(false);
  });

  it("ignores map-only visibility changes", () => {
    expect(semanticSnapshotEqual(
      snapshot({ mapVisibleSourceIds: new Set(["a"]) }),
      snapshot({ mapVisibleSourceIds: new Set(["b", "c"]) })
    )).toBe(true);
  });

  it("treats turn lifecycle changes as semantically meaningful", () => {
    const left = snapshot();
    const right = snapshot({ turn: { ...left.turn, turnNumber: left.turn.turnNumber + 1 } });
    expect(semanticSnapshotEqual(left, right)).toBe(false);
  });
});
