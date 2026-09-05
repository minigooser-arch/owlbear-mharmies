import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type NavalBattleState,
  type NavalSceneState
} from "../shared/types";
import { CommandProcessor } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function fixture(): NavalSceneState {
  const first = {
    ...createRegisteredShip("red", "CRUISER", "EAST"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "naval-1"
  };
  const second = {
    ...createRegisteredShip("blue", "BATTLESHIP", "WEST"),
    status: "IN_NAVAL_BATTLE" as const,
    battleId: "naval-1"
  };
  const battle: NavalBattleState = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    participantShipIds: ["first", "second"],
    snapshots: {
      first: { shipId: "first", strategicCell: { x: 0, y: 0 }, strategicPosition: { x: 50, y: 50 }, strategicFacing: "EAST" },
      second: { shipId: "second", strategicCell: { x: 1, y: 0 }, strategicPosition: { x: 150, y: 50 }, strategicFacing: "WEST" }
    },
    initiative: [
      { shipId: "first", initialRoll: 18, bonus: 2, total: 20, tieBreakRolls: [] },
      { shipId: "second", initialRoll: 14, bonus: 0, total: 14, tieBreakRolls: [] }
    ],
    roundNumber: 2,
    currentShipId: "first",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { first: 2, second: 3 },
    actionUsedByShip: { first: false, second: false },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 3,
    startedAt: 100,
    revision: 5
  };
  return {
    version: 6,
    revision: 9,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: ["red-player"], leaderPlayerIds: ["red-player"], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: ["blue-player"], leaderPlayerIds: ["blue-player"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: { first, second },
    navalBattleRequests: [],
    activeNavalBattle: battle,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function raw(playerId = "gm", connectionId = "gm-connection", shipId = "second") {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "override-active-ship",
    senderPlayerId: playerId,
    senderConnectionId: connectionId,
    expectedRevision: 9,
    type: "SET_ACTIVE_NAVAL_SHIP",
    shipId
  };
}

function execute(scene: NavalSceneState, commandRaw = raw(), role: "GM" | "PLAYER" = "GM") {
  const validation = validateArmyCommand(commandRaw);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return validation;
  return new CommandProcessor().execute({
    role,
    playerId: commandRaw.senderPlayerId,
    connectionId: commandRaw.senderConnectionId,
    connectedPlayerIds: new Set([commandRaw.senderPlayerId]),
    state: { scene, armies: {}, barriers: {}, items: {} }
  }, validation.command);
}

it("lets the GM switch to another pending eligible ship without resetting round state", () => {
  const scene = fixture();
  const beforeBattle = structuredClone(scene.activeNavalBattle);
  const result = execute(scene);

  expect(result).toMatchObject({ status: "ACCEPTED" });
  if (!result || !("status" in result) || result.status !== "ACCEPTED") return;
  expect(result.state.scene.revision).toBe(10);
  expect(result.state.scene.activeNavalBattle).toMatchObject({
    currentShipId: "second",
    roundNumber: 2,
    completedShipIdsThisRound: [],
    movementRemainingByShip: { first: 2, second: 3 },
    actionUsedByShip: { first: false, second: false },
    initiative: beforeBattle?.initiative,
    revision: 6
  });
});

it("keeps manual active-ship switching GM-only", () => {
  const result = execute(fixture(), raw("red-player", "red-connection"), "PLAYER");
  expect(result).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
});

it("rejects completed and exited ships as override targets", () => {
  const completed = fixture();
  if (!completed.activeNavalBattle) throw new Error("fixture battle missing");
  completed.activeNavalBattle.completedShipIdsThisRound = ["second"];
  expect(execute(completed)).toEqual({ status: "REJECTED", reason: "INVALID_NAVAL_TACTICAL_ACTION" });

  const exited = fixture();
  if (!exited.activeNavalBattle) throw new Error("fixture battle missing");
  exited.activeNavalBattle.exitedShipIds = ["second"];
  expect(execute(exited)).toEqual({ status: "REJECTED", reason: "SHIP_ALREADY_EXITED" });
});

it("rejects a destroyed ship as an override target", () => {
  const scene = fixture();
  if (!scene.ships?.second) throw new Error("fixture ship missing");
  scene.ships.second.hp = 0;
  expect(execute(scene)).toEqual({ status: "REJECTED", reason: "SHIP_DESTROYED" });
});
