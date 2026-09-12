import { describe, expect, it } from "vitest";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";
import { validateArmyCommand } from "./commandValidation";
import { COMMAND_PROTOCOL_VERSION, type StrategicCity } from "../shared/types";
import type { StrategicCityCommand, StrategicCityCommandPayload } from "../cities/strategicCityCommands";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";

const city: StrategicCity = {
  id: "moscow",
  name: "Москва",
  cells: [{ x: 0, y: 0 }],
  recognizedStateId: "russia",
  deFactoStateId: "russia",
  factionInfluenceId: null,
  mayorId: null,
  isCapital: true,
  historicalBuildTypeCount: 4
};

function state(): CommandState {
  return {
    scene: {
      version: 7,
      revision: 3,
      settings: structuredClone(DEFAULT_SETTINGS),
      sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "russia" }],
      states: [{ id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true }],
      relations: {},
      battleGroups: [],
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: {
        version: 1,
        revision: 0,
        cells: {
          "0,0": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: "russia" },
          "1,0": { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: "russia" }
        }
      },
      wars: [],
      turn: structuredClone(DEFAULT_TURN_STATE),
      ships: {},
      navalBattleRequests: [],
      transportEmbarkRequests: [],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {},
      stateRelations: {},
      foreignPresenceViolations: [],
      forcedExitStates: [],
      strategicCities: [],
      territorialScores: [],
      rebellions: [],
      turnCheckpoint: null
    },
    armies: {},
    barriers: {},
    items: {}
  };
}

function context(role: "GM" | "PLAYER" = "GM"): CommandContext {
  return {
    role,
    playerId: "gm",
    connectionId: "conn",
    connectedPlayerIds: new Set(["gm"]),
    state: state()
  };
}

function command(payload: StrategicCityCommandPayload): StrategicCityCommand {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: crypto.randomUUID(),
    senderPlayerId: "gm",
    senderConnectionId: "conn",
    expectedRevision: 3,
    ...payload
  } as StrategicCityCommand;
}

describe("strategic city commands", () => {
  it("validates create, update and delete envelopes", () => {
    expect(validateArmyCommand(command({ type: "CREATE_STRATEGIC_CITY", city }))).toMatchObject({ ok: true, command: { type: "CREATE_STRATEGIC_CITY" } });
    expect(validateArmyCommand(command({ type: "UPDATE_STRATEGIC_CITY", cityId: "moscow", patch: { historicalBuildTypeCount: 5 } }))).toMatchObject({ ok: true, command: { type: "UPDATE_STRATEGIC_CITY" } });
    expect(validateArmyCommand(command({ type: "DELETE_STRATEGIC_CITY", cityId: "moscow" }))).toMatchObject({ ok: true, command: { type: "DELETE_STRATEGIC_CITY" } });
  });

  it("rejects malformed city payloads at validation", () => {
    const malformed = { ...command({ type: "CREATE_STRATEGIC_CITY", city }), city: { ...city, cells: [] } };
    expect(validateArmyCommand(malformed)).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });

  it("allows only the GM and rejects forged senders", () => {
    const processor = new CommandProcessor();
    expect(processor.execute(context("PLAYER"), command({ type: "CREATE_STRATEGIC_CITY", city }))).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(processor.execute(context(), { ...command({ type: "CREATE_STRATEGIC_CITY", city }), senderConnectionId: "forged" })).toEqual({ status: "REJECTED", reason: "FORGED_CONNECTION" });
  });

  it("creates, updates and deletes cities through authoritative revisioned state", () => {
    const processor = new CommandProcessor();
    const created = processor.execute(context(), command({ type: "CREATE_STRATEGIC_CITY", city }));
    expect(created.status).toBe("ACCEPTED");
    if (created.status !== "ACCEPTED") return;
    expect(created.state.scene.revision).toBe(4);
    expect(created.state.scene.strategicCities).toEqual([city]);

    const updatedContext = { ...context(), state: created.state };
    const updated = processor.execute(updatedContext, {
      ...command({ type: "UPDATE_STRATEGIC_CITY", cityId: "moscow", patch: { historicalBuildTypeCount: 7, cells: [{ x: 1, y: 0 }] } }),
      expectedRevision: 4
    });
    expect(updated.status).toBe("ACCEPTED");
    if (updated.status !== "ACCEPTED") return;
    expect(updated.state.scene.strategicCities?.[0]).toMatchObject({ historicalBuildTypeCount: 7, cells: [{ x: 1, y: 0 }] });

    const deleted = processor.execute({ ...context(), state: updated.state }, {
      ...command({ type: "DELETE_STRATEGIC_CITY", cityId: "moscow" }),
      expectedRevision: 5
    });
    expect(deleted.status).toBe("ACCEPTED");
    if (deleted.status === "ACCEPTED") expect(deleted.state.scene.strategicCities).toEqual([]);
  });
});
