import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneItemRecord, SceneState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

function item(id: string): SceneItemRecord {
  return { id, type: "IMAGE", name: id, position: { x: 0, y: 0 }, metadata: {} };
}

function scene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS, defaultDetectionRangeCells: 6 },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }],
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

it("exposes both configured and effective ship detection ranges to the GM snapshot", () => {
  const defaultShip = createRegisteredShip("red", "CRUISER", "NORTH");
  const overriddenShip = createRegisteredShip("red", "CRUISER", "NORTH");
  overriddenShip.detectionOverride = 4.5;

  const snapshot = buildRoleSafeSnapshot({
    role: "GM",
    playerId: "gm",
    scene: scene(),
    players: [],
    armies: [],
    ships: [
      { item: item("default-ship"), state: defaultShip },
      { item: item("override-ship"), state: overriddenShip }
    ],
    mapVisibleSourceIds: new Set<string>()
  });
  const ships = snapshot.ships as unknown as Array<{
    id: string;
    detectionOverride: number | null;
    effectiveDetectionRange: number;
  }>;

  expect(ships.find((ship) => ship.id === "default-ship")).toMatchObject({
    detectionOverride: null,
    effectiveDetectionRange: 6
  });
  expect(ships.find((ship) => ship.id === "override-ship")).toMatchObject({
    detectionOverride: 4.5,
    effectiveDetectionRange: 4.5
  });
});
