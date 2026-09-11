import { expect, it } from "vitest";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneItemRecord, type SceneState } from "../shared/types";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";

function image(id: string, x: number): SceneItemRecord {
  return { id, type: "IMAGE", position: { x: x * 100 + 50, y: 50 }, metadata: {} };
}

function commandState(): CommandState {
  const scene: SceneState = {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Blue", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [], relations: {}, battleGroups: [], terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 1, cells: {
      "0,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
      "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
      "2,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
    } },
    wars: [], turn: { ...DEFAULT_TURN_STATE, turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: {
      red: createRegisteredShip("red", "CRUISER", "EAST"),
      blue: createRegisteredShip("blue", "BATTLESHIP", "WEST")
    },
    navalBattleRequests: [{ id: "request", initiatingShipId: "red", targetShipId: "blue", createdOnTurn: 8 }],
    transportEmbarkRequests: [], activeNavalBattle: null, navalBattleHistory: [], navalRevealUntilTurn: {}
  };
  return { scene, armies: {}, barriers: {}, items: { red: image("red", 0), blue: image("blue", 2) } };
}

it("starts a requested naval battle even when the GM selection omits a participant cell", () => {
  const state = commandState();
  const processor = new CommandProcessor(
    () => new Date("2026-09-10T20:00:00Z"),
    (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),
    (cell) => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 })
  );
  const context: CommandContext = { role: "GM", playerId: "gm", connectionId: "gm-c", connectedPlayerIds: new Set(["gm"]), state };
  const command: ArmyCommand = {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "start",
    senderPlayerId: "gm",
    senderConnectionId: "gm-c",
    expectedRevision: 4,
    type: "START_NAVAL_BATTLE",
    battleId: "battle",
    navalRequestId: "request",
    initiatingShipId: "red",
    participantShipIds: ["red", "blue"],
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  };

  const result = processor.execute(context, command);
  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  expect(result.state.scene.activeNavalBattle?.areaCells).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 }
  ]);
});
