import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { NavalSceneState, SceneItemRecord, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

function item(id: string, name: string): SceneItemRecord {
  return { id, type: "IMAGE", name, position: { x: 0, y: 0 }, metadata: {} };
}

function scene(): NavalSceneState {
  return {
    version: 6,
    revision: 5,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["leader", "member"],
        leaderPlayerIds: ["leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#00f",
        playerIds: ["blue"],
        leaderPlayerIds: ["blue"],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },
    ships: {
      "red-ship": createRegisteredShip("red", "CRUISER", "EAST"),
      "blue-visible": createRegisteredShip("blue", "BATTLESHIP", "WEST"),
      "blue-hidden": createRegisteredShip("blue", "IRONCLAD", "WEST")
    },
    navalBattleRequests: [
      {
        id: "req-1",
        initiatingShipId: "red-ship",
        targetShipId: "blue-visible",
        createdOnTurn: 7
      }
    ],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function ship(current: NavalSceneState, id: string): ShipState {
  const value = current.ships[id];
  if (!value) throw new Error(`Missing ship fixture: ${id}`);
  return value;
}

const shipRecords = (current: NavalSceneState) => [
  { item: item("red-ship", "Аврора"), state: ship(current, "red-ship") },
  { item: item("blue-visible", "Видимый линкор"), state: ship(current, "blue-visible") },
  { item: item("blue-hidden", "Скрытый броненосец"), state: ship(current, "blue-hidden") }
];

it("gives a leader only minimal map-visible enemy ships as naval request targets", () => {
  const current = scene();
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "leader",
    scene: current,
    players: [],
    armies: [],
    ships: shipRecords(current),
    mapVisibleSourceIds: new Set(["blue-visible"])
  });

  expect(snapshot).toMatchObject({
    navalRequestTargets: [
      {
        id: "blue-visible",
        name: "Видимый линкор",
        sideId: "blue",
        sideName: "Синие"
      }
    ]
  });
  const targets = (snapshot as unknown as { navalRequestTargets: Array<Record<string, unknown>> }).navalRequestTargets;
  expect(Object.keys(targets[0] ?? {}).sort()).toEqual(["id", "name", "sideId", "sideName"]);
  expect(snapshot.ships?.map((candidate) => candidate.id)).toEqual(["red-ship"]);
  expect(JSON.stringify(snapshot)).not.toContain("Скрытый броненосец");
});

it("does not expose naval request targets to an ordinary faction member", () => {
  const current = scene();
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "member",
    scene: current,
    players: [],
    armies: [],
    ships: shipRecords(current),
    mapVisibleSourceIds: new Set(["blue-visible"])
  });

  expect(snapshot).toMatchObject({ navalRequestTargets: [] });
});

it("exposes pending naval battle requests only to the GM", () => {
  const current = scene();
  const gm = buildRoleSafeSnapshot({
    role: "GM",
    playerId: "gm",
    scene: current,
    players: [],
    armies: [],
    ships: shipRecords(current),
    mapVisibleSourceIds: new Set()
  });
  const leader = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "leader",
    scene: current,
    players: [],
    armies: [],
    ships: shipRecords(current),
    mapVisibleSourceIds: new Set(["blue-visible"])
  });

  expect(gm).toMatchObject({
    pendingNavalBattleRequests: [
      {
        id: "req-1",
        initiatingShipId: "red-ship",
        targetShipId: "blue-visible",
        createdOnTurn: 7
      }
    ]
  });
  expect(leader).toMatchObject({ pendingNavalBattleRequests: [] });
});
