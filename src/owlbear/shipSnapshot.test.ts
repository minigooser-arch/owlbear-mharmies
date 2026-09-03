import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneItemRecord, SceneState, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

function shipState(sideId: string): ShipState {
  return {
    version: 1,
    registered: true,
    sideId,
    classId: "CRUISER",
    status: "READY",
    hp: 25,
    temporaryHp: 0,
    facing: "NORTH",
    plannedRoute: [],
    globalMovementRemaining: 3,
    movementSpentThisTurn: false,
    battleId: null,
    detectionOverride: null,
    embarkedArmyId: null,
    shoreBombardmentUsedOnTurn: null,
    logisticsActionUsedOnTurn: null,
    revision: 1
  };
}

function item(id: string, name: string): SceneItemRecord {
  return { id, type: "IMAGE", name, position: { x: 0, y: 0 }, metadata: {} };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: DEFAULT_SETTINGS,
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["player"], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

it("gives players only ships from their member factions and GM all ships", () => {
  const ships = [
    { item: item("red-ship", "Аврора"), state: shipState("red") },
    { item: item("blue-ship", "Блюхер"), state: shipState("blue") }
  ];
  const common = {
    scene: scene(),
    players: [],
    armies: [],
    ships,
    mapVisibleSourceIds: new Set<string>()
  };

  const playerSnapshot = buildRoleSafeSnapshot({ ...common, role: "PLAYER", playerId: "player" });
  const gmSnapshot = buildRoleSafeSnapshot({ ...common, role: "GM", playerId: "gm" });
  const playerShips = (playerSnapshot as unknown as { ships: Array<{ id: string }> }).ships;
  const gmShips = (gmSnapshot as unknown as { ships: Array<{ id: string }> }).ships;

  expect(playerShips.map((ship) => ship.id)).toEqual(["red-ship"]);
  expect(gmShips.map((ship) => ship.id).sort()).toEqual(["blue-ship", "red-ship"]);
  expect(playerSnapshot.mapVisibleSourceIds).toContain("red-ship");
  expect(playerSnapshot.mapVisibleSourceIds).not.toContain("blue-ship");
});
