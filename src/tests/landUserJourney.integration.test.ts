import { expect, it } from "vitest";
import { CommandProcessor, type CommandContext, type CommandState } from "../commands/commandProcessor";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommandPayload,
  type SceneItemRecord,
  type SceneState
} from "../shared/types";

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    stateRelations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function image(id: string, name: string, x: number): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    name,
    position: { x: x * 100 + 50, y: 50 },
    metadata: {}
  };
}

it("plays a land campaign from empty scene setup through state map, armies, diplomacy and route planning", () => {
  const processor = new CommandProcessor();
  let current: CommandState = {
    scene: scene(),
    armies: {},
    barriers: {},
    items: {
      "red-army": image("red-army", "1-я русская армия", 0),
      "blue-army": image("blue-army", "1-я германская армия", 4)
    }
  };
  let request = 0;
  const connectedPlayerIds = new Set(["gm", "red-leader", "blue-leader"]);

  const execute = (
    role: "GM" | "PLAYER",
    playerId: string,
    payload: ArmyCommandPayload,
    expectedStatus: "ACCEPTED" | "REJECTED" = "ACCEPTED"
  ) => {
    request += 1;
    const connectionId = `${playerId}-connection`;
    const context: CommandContext = {
      role,
      playerId,
      connectionId,
      connectedPlayerIds,
      state: current
    };
    const result = processor.execute(context, {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: `land-journey-${request}`,
      senderPlayerId: playerId,
      senderConnectionId: connectionId,
      expectedRevision: current.scene.revision,
      ...payload
    });
    expect(result.status).toBe(expectedStatus);
    if (result.status === "ACCEPTED") current = result.state;
    return result;
  };

  execute("GM", "gm", {
    type: "SET_TERRAIN_CELLS",
    terrainId: "plain",
    cells: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 }))
  });

  execute("GM", "gm", {
    type: "CREATE_SIDE",
    side: {
      id: "red",
      name: "Русская фракция",
      color: "#b3261e",
      playerIds: [],
      leaderPlayerIds: [],
      stateId: null
    }
  });
  execute("GM", "gm", {
    type: "CREATE_SIDE",
    side: {
      id: "blue",
      name: "Германская фракция",
      color: "#334488",
      playerIds: [],
      leaderPlayerIds: [],
      stateId: null
    }
  });

  execute("GM", "gm", {
    type: "CREATE_STATE",
    state: {
      id: "russia",
      name: "Россия",
      color: "#c94f4f",
      rulingFactionId: null,
      active: false
    }
  });
  execute("GM", "gm", {
    type: "CREATE_STATE",
    state: {
      id: "germany",
      name: "Германия",
      color: "#4f62c9",
      rulingFactionId: null,
      active: false
    }
  });

  execute("GM", "gm", { type: "SET_SIDE_STATE", sideId: "red", stateId: "russia" });
  execute("GM", "gm", { type: "SET_SIDE_STATE", sideId: "blue", stateId: "germany" });
  execute("GM", "gm", {
    type: "UPDATE_STATE",
    stateId: "russia",
    patch: { rulingFactionId: "red", active: true }
  });
  execute("GM", "gm", {
    type: "UPDATE_STATE",
    stateId: "germany",
    patch: { rulingFactionId: "blue", active: true }
  });

  execute("GM", "gm", { type: "ADD_SIDE_LEADER", sideId: "red", playerId: "red-leader" });
  execute("GM", "gm", { type: "ADD_SIDE_LEADER", sideId: "blue", playerId: "blue-leader" });

  execute("GM", "gm", {
    type: "SET_RECOGNIZED_STATE_CELLS",
    stateId: "russia",
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  });
  execute("GM", "gm", {
    type: "SET_DEFACTO_STATE_CELLS",
    stateId: "russia",
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  });
  execute("GM", "gm", {
    type: "SET_RECOGNIZED_STATE_CELLS",
    stateId: "germany",
    cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }]
  });
  execute("GM", "gm", {
    type: "SET_DEFACTO_STATE_CELLS",
    stateId: "germany",
    cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }]
  });

  expect(current.scene.gridMap.cells["0,0"]).toMatchObject({
    recognizedStateId: "russia",
    deFactoStateId: "russia"
  });
  expect(current.scene.gridMap.cells["4,0"]).toMatchObject({
    recognizedStateId: "germany",
    deFactoStateId: "germany"
  });

  execute("GM", "gm", { type: "REGISTER_ARMY", itemId: "red-army", sideId: "red" });
  execute("GM", "gm", { type: "REGISTER_ARMY", itemId: "blue-army", sideId: "blue" });

  expect(current.armies["red-army"]).toMatchObject({ sideId: "red", status: "READY" });
  expect(current.armies["blue-army"]).toMatchObject({ sideId: "blue", status: "READY" });

  execute("PLAYER", "red-leader", {
    type: "SET_ROUTE",
    armyId: "red-army",
    startCell: { x: 0, y: 0 },
    cells: [{ x: 1, y: 0 }],
    route: [{ x: 150, y: 50 }]
  });

  const unauthorized = execute("PLAYER", "blue-leader", {
    type: "SET_ROUTE",
    armyId: "red-army",
    startCell: { x: 0, y: 0 },
    cells: [{ x: 1, y: 0 }],
    route: [{ x: 150, y: 50 }]
  }, "REJECTED");
  expect(unauthorized).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });

  execute("GM", "gm", {
    type: "SET_STATE_WAR",
    leftStateId: "russia",
    rightStateId: "germany",
    atWar: true
  });
  expect(current.scene.stateRelations).toMatchObject({
    russia: { germany: { atWar: true } },
    germany: { russia: { atWar: true } }
  });

  execute("PLAYER", "red-leader", {
    type: "SET_ROUTE",
    armyId: "red-army",
    startCell: { x: 0, y: 0 },
    cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    route: [{ x: 150, y: 50 }, { x: 250, y: 50 }, { x: 350, y: 50 }]
  });

  expect(current.armies["red-army"]?.plannedRoute.cells).toEqual([
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 }
  ]);
  expect(current.armies["red-army"]?.plannedRoute.requiresReplan).toBe(false);
});
