import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommandPayload, type SceneItemRecord, type SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "../commands/commandProcessor";

function scene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["red-leader"], leaderPlayerIds: ["red-leader"], stateId: null },
      { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue-leader"], leaderPlayerIds: ["blue-leader"], stateId: null },
      { id: "green", name: "Зелёные", color: "#0a0", playerIds: ["green-leader"], leaderPlayerIds: ["green-leader"], stateId: null }
    ],
    states: [],
    relations: { red: { blue: "ENEMY", green: "NEUTRAL" }, blue: { red: "ENEMY" }, green: { red: "NEUTRAL" } },
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function image(id: string, name: string, cellX: number): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    name,
    position: { x: cellX * 100 + 50, y: 50 },
    metadata: {}
  };
}

it("paints sea, registers three factions' ships, requests, fights and completes a naval battle", () => {
  const detected = new Set<string>();
  const processor = new CommandProcessor(
    () => new Date("2026-09-06T12:00:00Z"),
    (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),
    (cell) => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 }),
    () => new Set(detected),
    () => 4
  );
  let current: CommandState = {
    scene: scene(),
    armies: {},
    barriers: {},
    items: {
      red: image("red", "Аврора", 0),
      blue: image("blue", "Слава", 3),
      green: image("green", "Нейтральный броненосец", 4)
    }
  };
  let requestCounter = 0;

  const execute = (
    role: "GM" | "PLAYER",
    playerId: string,
    payload: ArmyCommandPayload,
    expectAccepted = true
  ) => {
    requestCounter += 1;
    const context: CommandContext = {
      role,
      playerId,
      connectionId: `${playerId}-connection`,
      connectedPlayerIds: new Set(["gm", "red-leader", "blue-leader", "green-leader"]),
      state: current
    };
    const result = processor.execute(context, {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: `journey-${requestCounter}`,
      senderPlayerId: playerId,
      senderConnectionId: `${playerId}-connection`,
      expectedRevision: current.scene.revision,
      ...payload
    });
    if (expectAccepted) {
      expect(result.status).toBe("ACCEPTED");
      if (result.status === "ACCEPTED") current = result.state;
    }
    return result;
  };

  // GM paints a five-cell strip of sea exactly as the map brush ultimately does.
  execute("GM", "gm", {
    type: "SET_TERRAIN_CELLS",
    terrainId: "sea",
    cells: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 }))
  });

  // GM registers ships for three different sides on the painted cells.
  execute("GM", "gm", { type: "REGISTER_SHIP", itemId: "red", sideId: "red", classId: "CRUISER", facing: "EAST" });
  execute("GM", "gm", { type: "REGISTER_SHIP", itemId: "blue", sideId: "blue", classId: "BATTLESHIP", facing: "WEST" });
  execute("GM", "gm", { type: "REGISTER_SHIP", itemId: "green", sideId: "green", classId: "IRONCLAD", facing: "WEST" });
  expect(Object.keys(current.scene.ships ?? {})).toEqual(["red", "blue", "green"]);

  // Battle requests become available only after movement is closed.
  execute("GM", "gm", { type: "COMPLETE_MOVEMENT_PHASE" });
  expect(current.scene.turn.phase).toBe("POST_MOVEMENT");

  detected.add("blue");
  const requestResult = execute("PLAYER", "red-leader", {
    type: "REQUEST_NAVAL_BATTLE",
    initiatingShipId: "red",
    targetShipId: "blue"
  });
  expect(requestResult.status).toBe("ACCEPTED");
  const pendingRequest = current.scene.navalBattleRequests?.[0];
  expect(pendingRequest?.targetShipId).toBe("blue");

  // A stale request must not let the GM start a battle after contact is lost.
  detected.clear();
  const staleStart = execute("GM", "gm", {
    type: "START_NAVAL_BATTLE",
    battleId: "battle-1",
    navalRequestId: pendingRequest?.id ?? "missing",
    initiatingShipId: "red",
    participantShipIds: ["red", "blue"],
    areaCells: [0, 1, 2, 3].map((x) => ({ x, y: 0 }))
  }, false);
  expect(staleStart).toEqual({ status: "REJECTED", reason: "TARGET_NOT_DETECTED" });
  expect(current.scene.activeNavalBattle).toBeNull();

  // Contact is restored, so the GM can start the saved request.
  detected.add("blue");
  execute("GM", "gm", {
    type: "START_NAVAL_BATTLE",
    battleId: "battle-1",
    navalRequestId: pendingRequest?.id ?? "missing",
    initiatingShipId: "red",
    participantShipIds: ["red", "blue"],
    areaCells: [0, 1, 2, 3].map((x) => ({ x, y: 0 }))
  });
  expect(current.scene.activeNavalBattle?.status).toBe("ACTIVE");
  expect(current.scene.navalBattleRequests).toEqual([]);

  // Make the cruiser active deterministically, move one cell, turn and fire a legal broadside.
  if (current.scene.activeNavalBattle?.currentShipId !== "red") {
    execute("GM", "gm", { type: "SET_ACTIVE_NAVAL_SHIP", shipId: "red" });
  }
  execute("PLAYER", "red-leader", { type: "NAVAL_MOVE_FORWARD", shipId: "red" });
  execute("PLAYER", "red-leader", { type: "NAVAL_TURN_SHIP", shipId: "red", direction: "LEFT" });
  const hpBefore = current.scene.ships?.blue?.hp ?? 0;
  execute("PLAYER", "red-leader", {
    type: "NAVAL_BROADSIDE_ATTACK",
    shipId: "red",
    targetShipId: "blue",
    friendlyFireConfirmed: false
  });
  expect(current.scene.ships?.blue?.hp).toBe(hpBefore - 5); // 2d6 => 8, battleship armor => 3.

  // Manual completion restores strategic position/facing and archives the battle.
  execute("GM", "gm", { type: "COMPLETE_NAVAL_BATTLE" });
  expect(current.scene.activeNavalBattle).toBeNull();
  expect(current.scene.navalBattleHistory).toHaveLength(1);
  expect(current.scene.ships?.red).toMatchObject({ status: "READY", facing: "EAST" });
  expect(current.positions?.red).toEqual({ x: 50, y: 50 });
  expect(current.scene.turn.phase).toBe("POST_MOVEMENT");
});
