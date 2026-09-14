import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyCommand, ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function army(): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "rebels",
    status: "PAUSED",
    overrides: {},
    route: [{ x: 150, y: 50 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 9,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 7,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 6, enteredRouteCellCount: 0 },
    health: { hp: 37, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 8 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 4
  };
}

function scene(): SceneState {
  return {
    version: 7,
    revision: 7,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "gov", name: "Правительство", color: "#333", playerIds: [], leaderPlayerIds: [], stateId: "empire" },
      { id: "rebels", name: "Повстанцы", color: "#933", playerIds: [], leaderPlayerIds: [], stateId: "empire" }
    ],
    states: [{ id: "empire", name: "Империя", color: "#777", rulingFactionId: "gov", active: true }],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 2,
      cells: {
        "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "empire", deFactoStateId: "empire" },
        "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "empire", deFactoStateId: "empire" }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8 },
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [{
      id: "rebel-city",
      name: "Повстанческий город",
      cells: [{ x: 1, y: 0 }],
      recognizedStateId: "empire",
      deFactoStateId: "empire",
      factionInfluenceId: "rebels",
      mayorId: null,
      isCapital: false,
      historicalBuildTypeCount: 1
    }],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: null
  };
}

function command(sender = "gm"): ArmyCommand {
  return {
    type: "START_CIVIL_WAR",
    protocolVersion: 5,
    requestId: "request",
    senderPlayerId: sender,
    senderConnectionId: sender + "-connection",
    expectedRevision: 7,
    sourceStateId: "empire",
    rebelFactionId: "rebels",
    newStateId: "rebel-state",
    newStateName: "Республика",
    newStateColor: "#aa3344"
  };
}

function context(role: "GM" | "PLAYER"): CommandContext {
  const id = role === "GM" ? "gm" : "player";
  const token: SceneItemRecord = {
    id: "army",
    type: "IMAGE",
    name: "Армия",
    position: { x: 50, y: 50 },
    metadata: {}
  };
  return {
    role,
    playerId: id,
    connectionId: id + "-connection",
    connectedPlayerIds: new Set(["gm", "player"]),
    state: {
      scene: scene(),
      armies: { army: army() },
      barriers: {},
      items: { army: token },
      positions: { army: { x: 50, y: 50 } }
    } as CommandState
  };
}

describe("civil war command", () => {
  it("changes only scene political state while preserving armies, positions, HP and routes", () => {
    const current = context("GM");
    const armiesBefore = structuredClone(current.state.armies);
    const positionsBefore = structuredClone(current.state.positions);
    const itemsBefore = structuredClone(current.state.items);

    const result = new CommandProcessor().execute(current, command());
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;

    expect(result.state.armies).toEqual(armiesBefore);
    expect(result.state.positions).toEqual(positionsBefore);
    expect(result.state.items).toEqual(itemsBefore);
    expect(result.state.armies.army?.health).toEqual({ hp: 37, maxHp: 50 });
    expect(result.state.armies.army?.route).toEqual([{ x: 150, y: 50 }]);
    expect(result.state.armies.army?.plannedRoute).toEqual(armiesBefore.army?.plannedRoute);
    expect(result.state.scene.states.find((state) => state.id === "rebel-state")?.rulingFactionId).toBe("rebels");
    expect(result.state.scene.gridMap.cells["1,0"]?.recognizedStateId).toBe("rebel-state");
    expect(result.state.scene.gridMap.cells["1,0"]?.deFactoStateId).toBe("empire");
  });

  it("keeps civil-war splitting GM-only", () => {
    expect(new CommandProcessor().execute(context("PLAYER"), command("player"))).toEqual({
      status: "REJECTED",
      reason: "GM_ONLY"
    });
  });
});
