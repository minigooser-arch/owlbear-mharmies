import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type NavalSceneState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

it("rejects a naval battle area that contains a non-SEA cell", () => {
  const scene: NavalSceneState = {
    version: 6,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 2, phase: "MOVEMENT" },
    ships: {
      red: createRegisteredShip("red", "CRUISER", "EAST"),
      blue: createRegisteredShip("blue", "BATTLESHIP", "WEST")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  const validation = validateArmyCommand({
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "start-land-area",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 2,
    type: "START_NAVAL_BATTLE",
    battleId: "naval-land",
    navalRequestId: null,
    initiatingShipId: "red",
    participantShipIds: ["red", "blue"],
    areaCells: [{ x: 0, y: 0 }]
  });
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;

  const result = new CommandProcessor(
    () => new Date("2026-09-04T09:30:00.000Z"),
    (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) })
  ).execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: {
      scene,
      armies: {},
      barriers: {},
      items: {},
      positions: { red: { x: 50, y: 50 }, blue: { x: 150, y: 50 } }
    }
  }, validation.command);

  expect(result).toEqual({ status: "REJECTED", reason: "INVALID_NAVAL_BATTLE_AREA" });
});
