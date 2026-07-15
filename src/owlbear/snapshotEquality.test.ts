import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import type { RawExtensionSnapshot } from "../ui/state/useExtensionState";
import { semanticSnapshotEqual, semanticValueEqual } from "./snapshotEquality";

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
        route: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
      },
      {
        id: "army-2",
        name: "Second",
        sideId: "blue",
        sideName: "Blue",
        status: "MOVING",
        route: []
      }
    ],
    sides: [
      {
        id: "red",
        name: "Red",
        color: "#f00",
        playerIds: ["p1", "p2"],
        leaderPlayerIds: ["p1", "p2"]
      },
      {
        id: "blue",
        name: "Blue",
        color: "#00f",
        playerIds: [],
        leaderPlayerIds: []
      }
    ],
    relations: {
      red: { blue: "ENEMY", red: "ALLY" },
      blue: { red: "ENEMY", blue: "ALLY" }
    },
    battleGroups: [
      { battleId: "battle-1", name: "Bridge", participantIds: ["army-1", "army-2"], revision: 1 },
      { battleId: "battle-2", name: "Hill", participantIds: ["army-3"], revision: 1 }
    ],
    settings: { ...DEFAULT_SETTINGS },
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
      sides: [...left.sides].reverse().map((side) => ({
        ...side,
        playerIds: [...side.playerIds].reverse(),
        leaderPlayerIds: [...side.leaderPlayerIds].reverse()
      })),
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

  it("ignores map-only visibility changes", () => {
    expect(semanticSnapshotEqual(
      snapshot({ mapVisibleSourceIds: new Set(["a"]) }),
      snapshot({ mapVisibleSourceIds: new Set(["b", "c"]) })
    )).toBe(true);
  });
});
