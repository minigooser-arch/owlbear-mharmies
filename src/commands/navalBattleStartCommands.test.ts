import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type NavalSceneState } from "../shared/types";
import { CommandProcessor } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";

function sceneFixture(): NavalSceneState {
  return {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      { id: "red", name: "Красные", color: "#c62828", playerIds: ["red-player"], leaderPlayerIds: ["red-player"], stateId: null },
      { id: "blue", name: "Синие", color: "#1565c0", playerIds: ["blue-player"], leaderPlayerIds: ["blue-player"], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: {
        ...structuredClone(DEFAULT_TERRAIN.types),
        sea: {
          id: "sea",
          name: "Море",
          movementCostUnits: 1,
          enabled: true,
          movementDomains: ["SEA"],
          blocksNavalLos: false
        }
      }
    },
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },
    ships: {
      "red-ship": { ...createRegisteredShip("red", "CRUISER", "EAST") },
      "blue-ship": { ...createRegisteredShip("blue", "BATTLESHIP", "WEST") }
    },
    navalBattleRequests: [{ id: "req-1", initiatingShipId: "red-ship", targetShipId: "blue-ship", createdOnTurn: 3 }],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function rawStartCommand(senderPlayerId = "gm", senderConnectionId = "gm-connection") {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "start-naval",
    senderPlayerId,
    senderConnectionId,
    expectedRevision: 4,
    type: "START_NAVAL_BATTLE",
    battleId: "naval-1",
    navalRequestId: "req-1",
    initiatingShipId: "red-ship",
    participantShipIds: ["red-ship", "blue-ship"],
    areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  };
}

function gmState() {
  return {
    scene: sceneFixture(),
    armies: {},
    barriers: {},
    items: {},
    positions: {
      "red-ship": { x: 50, y: 50 },
      "blue-ship": { x: 150, y: 50 }
    }
  };
}

function processor(detected: ReadonlySet<string>) {
  return new CommandProcessor(
    () => new Date("2026-09-04T09:00:00.000Z"),
    (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),
    undefined,
    () => detected
  );
}

it("starts a request-backed naval battle only while its target is still detected", () => {
  const validation = validateArmyCommand(rawStartCommand());
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;

  const result = processor(new Set(["blue-ship"])).execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: gmState()
  }, validation.command);

  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  expect(result.state.scene.revision).toBe(5);
  expect(result.state.scene.turn.phase).toBe("POST_MOVEMENT");
  expect(result.state.scene.navalBattleRequests).toEqual([]);
  expect(result.state.scene.ships?.["red-ship"]).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "naval-1" });
  expect(result.state.scene.ships?.["blue-ship"]).toMatchObject({ status: "IN_NAVAL_BATTLE", battleId: "naval-1" });
  expect(result.state.scene.activeNavalBattle).toMatchObject({
    id: "naval-1",
    requestId: "req-1",
    participantShipIds: ["red-ship", "blue-ship"]
  });
});

it("rejects a saved request when the target is no longer detected at battle start", () => {
  const validation = validateArmyCommand(rawStartCommand());
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;

  const result = processor(new Set()).execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: gmState()
  }, validation.command);

  expect(result).toEqual({ status: "REJECTED", reason: "TARGET_NOT_DETECTED" });
});

it("rejects a request-backed start when the supplied participants omit the saved target", () => {
  const raw = { ...rawStartCommand(), participantShipIds: ["red-ship"] };
  const validation = validateArmyCommand(raw);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;

  const result = processor(new Set(["blue-ship"])).execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: gmState()
  }, validation.command);

  expect(result).toEqual({ status: "REJECTED", reason: "NAVAL_REQUEST_MISMATCH" });
});

it("keeps naval battle start GM-only", () => {
  const validation = validateArmyCommand(rawStartCommand("red-player", "red-connection"));
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;

  const result = new CommandProcessor().execute({
    role: "PLAYER",
    playerId: "red-player",
    connectionId: "red-connection",
    connectedPlayerIds: new Set(["red-player"]),
    state: { scene: sceneFixture(), armies: {}, barriers: {}, items: {} }
  }, validation.command);

  expect(result).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
});
