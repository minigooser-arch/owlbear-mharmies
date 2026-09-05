import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

it("keeps the current round number when the last eligible active ship reaches zero hp", () => {
  const ship = {
    ...createRegisteredShip("red", "BATTLESHIP", "NORTH"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "naval-1"
  };
  const scene: SceneState = {
    version: 6,
    revision: 3,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "POST_MOVEMENT" },
    ships: { ship },
    navalBattleRequests: [],
    activeNavalBattle: {
      version: 1,
      id: "naval-1",
      requestId: null,
      initiatorSideId: "red",
      areaCells: [],
      participantShipIds: ["ship"],
      snapshots: {},
      initiative: [{ shipId: "ship", initialRoll: 15, bonus: 2, total: 17, tieBreakRolls: [] }],
      roundNumber: 4,
      currentShipId: "ship",
      completedShipIdsThisRound: [],
      movementRemainingByShip: { ship: 2 },
      actionUsedByShip: { ship: false },
      exitedShipIds: [],
      status: "ACTIVE",
      events: [],
      startedOnTurn: 1,
      startedAt: 1,
      revision: 7
    },
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
  const state: CommandState = {
    scene,
    armies: {},
    barriers: {},
    items: {
      ship: { id: "ship", type: "IMAGE", name: "Петропавловск", position: { x: 0, y: 0 }, metadata: {} }
    }
  };
  const context: CommandContext = {
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state
  };
  const command = {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "last-ship-zero",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 3,
    type: "SET_SHIP_HP",
    shipId: "ship",
    hp: 0
  } as unknown as ArmyCommand;

  const result = new CommandProcessor().execute(context, command);

  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  expect(result.state.scene.ships?.ship?.hp).toBe(0);
  expect(result.state.scene.activeNavalBattle?.currentShipId).toBeNull();
  expect(result.state.scene.activeNavalBattle?.roundNumber).toBe(4);
});
