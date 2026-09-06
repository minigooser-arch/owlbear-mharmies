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
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "MOVEMENT" },
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

it("starts a precomputed naval battle from authoritative ship positions and consumes the request", () => {
  const validation = validateArmyCommand(rawStartCommand());
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;

  const processor = new CommandProcessor(
    () => new Date("2026-09-04T09:00:00.000Z"),
    (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) })
  );
  const result = processor.execute({
    role: "GM",
    playerId: "gm",
    connectionId: "gm-connection",
    connectedPlayerIds: new Set(["gm"]),
    state: {
      scene: sceneFixture(),
      armies: {},
      barriers: {},
      items: {},
      positions: {
        "red-ship": { x: 50, y: 50 },
        "blue-ship": { x: 150, y: 50 }
      }
    }
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
    participantShipIds: ["red-ship", "blue-ship"],
    snapshots: {
      "red-ship": {
        shipId: "red-ship",
        strategicCell: { x: 0, y: 0 },
        strategicPosition: { x: 50, y: 50 },
        strategicFacing: "EAST"
      },
      "blue-ship": {
        shipId: "blue-ship",
        strategicCell: { x: 1, y: 0 },
        strategicPosition: { x: 150, y: 50 },
        strategicFacing: "WEST"
      }
    }
  });
  expect(result.state.scene.activeNavalBattle?.initiative).toHaveLength(2);
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
