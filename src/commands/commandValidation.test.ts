import { describe, expect, it } from "vitest";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import { validateArmyCommand } from "./commandValidation";

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "request-1",
    senderPlayerId: "player-1",
    senderConnectionId: "connection-1",
    expectedRevision: 3,
    ...payload
  };
}

describe("validateArmyCommand", () => {
  it("accepts and sanitizes a complete side command", () => {
    expect(validateArmyCommand(envelope({
      type: "CREATE_SIDE",
      side: {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["leader"],
        leaderPlayerIds: ["leader"],
        ignored: "value"
      },
      ignored: "value"
    }))).toEqual({
      ok: true,
      command: {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: "request-1",
        senderPlayerId: "player-1",
        senderConnectionId: "connection-1",
        expectedRevision: 3,
        type: "CREATE_SIDE",
        side: {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: ["leader"],
          leaderPlayerIds: ["leader"]
        }
      }
    });
  });

  it.each([undefined, 1, 99])(
    "rejects unsupported command protocol %s with an actionable mismatch",
    (protocolVersion) => {
      expect(validateArmyCommand({
        ...envelope({ type: "START_ALL" }),
        protocolVersion
      })).toEqual({
        ok: false,
        requestId: "request-1",
        reason: "PROTOCOL_MISMATCH"
      });
    }
  );

  it("recovers a valid request id from a malformed payload", () => {
    expect(validateArmyCommand(envelope({ type: "CREATE_SIDE" }))).toEqual({
      ok: false,
      requestId: "request-1",
      reason: "INVALID_COMMAND"
    });
  });

  it("trims battle names and counts their length in Unicode code points", () => {
    const name = "😀".repeat(80);

    expect(validateArmyCommand(envelope({
      type: "RENAME_BATTLE_GROUP",
      battleId: "battle-1",
      name: `  ${name}  `
    }))).toMatchObject({
      ok: true,
      command: {
        type: "RENAME_BATTLE_GROUP",
        battleId: "battle-1",
        name
      }
    });
  });

  it.each(["   ", "😀".repeat(81)])(
    "rejects an invalid battle name while preserving the request id",
    (name) => {
      expect(validateArmyCommand(envelope({
        type: "RENAME_BATTLE_GROUP",
        battleId: "battle-1",
        name
      }))).toEqual({
        ok: false,
        requestId: "request-1",
        reason: "INVALID_BATTLE_NAME"
      });
    }
  );

  it.each(["__proto__", "constructor", "toString"])(
    "rejects inherited parser-map key %s without throwing",
    (type) => {
      expect(() => validateArmyCommand(envelope({ type }))).not.toThrow();
      expect(validateArmyCommand(envelope({ type }))).toMatchObject({
        ok: false,
        reason: "INVALID_COMMAND"
      });
    }
  );

  it.each(["__proto__", "prototype", "constructor", "toString", "hasOwnProperty"])(
    "rejects reserved relation side id %s",
    (sideId) => {
      expect(validateArmyCommand(envelope({
        type: "SET_RELATION",
        leftSideId: sideId,
        rightSideId: "blue",
        relation: "ENEMY"
      }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
    }
  );

  it.each([
    envelope({ type: "SET_ROUTE", armyId: "army", route: [{ x: Number.NaN, y: 0 }], startCell: { x: 0, y: 0 }, cells: [{ x: 1, y: 0 }] }),
    envelope({ type: "SET_ROUTE", armyId: "army", route: [{ x: 1, y: 0 }], startCell: { x: 0, y: 0 }, cells: [] }),
    envelope({ type: "START_ALL", expectedRevision: -1 }),
    envelope({ type: "UNKNOWN" })
  ])("rejects unsafe command shape %#", (value) => {
    expect(validateArmyCommand(value)).toMatchObject({
      ok: false,
      reason: "INVALID_COMMAND"
    });
  });

  it("rejects a leader list that is not a subset of members", () => {
    expect(validateArmyCommand(envelope({
      type: "CREATE_SIDE",
      side: {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: [],
        leaderPlayerIds: ["leader"]
      }
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });

  it.each([
    { type: "REGISTER_ARMY", itemId: "image", sideId: "red" },
    { type: "UNREGISTER_ARMY", armyId: "army" },
    { type: "ADD_SIDE_PLAYER", sideId: "red", playerId: "member" },
    { type: "REMOVE_SIDE_PLAYER", sideId: "red", playerId: "member" },
    { type: "ADD_SIDE_LEADER", sideId: "red", playerId: "leader" },
    { type: "REMOVE_SIDE_LEADER", sideId: "red", playerId: "leader" },
    { type: "SET_ROUTE", armyId: "army", route: [{ x: 1, y: 0 }], startCell: { x: 0, y: 0 }, cells: [{ x: 1, y: 0 }] },
    { type: "SET_TERRAIN_CELLS", cells: [{ x: 1, y: 0 }], terrainId: "forest" },
    { type: "SET_IMPASSABLE_CELLS", cells: [{ x: 1, y: 0 }], impassable: true },
    { type: "UPDATE_FACTION_TERRITORY_CELLS", cells: [{ x: 1, y: 0 }], sideId: "red", operation: "ADD" },
    { type: "CLEAR_CELL_PROPERTIES", cells: [{ x: 1, y: 0 }], target: "TERRAIN" },
    { type: "CREATE_TERRAIN_TYPE", terrain: { id: "swamp", name: "Болото", movementCostUnits: 5, enabled: true } },
    { type: "UPDATE_TERRAIN_TYPE", terrainId: "forest", patch: { movementCostUnits: 5 } },
    { type: "DELETE_TERRAIN_TYPE", terrainId: "swamp", replacementTerrainId: "plain" },
    { type: "CREATE_WAR", war: { id: "war", name: "Война", participantFactionIds: ["red", "blue"], active: true } },
    { type: "UPDATE_WAR", warId: "war", patch: { active: false } },
    { type: "END_WAR", warId: "war" },
    { type: "CLEAR_ROUTE", armyId: "army" },
    { type: "START_ARMY", armyId: "army" },
    { type: "PAUSE_ARMY", armyId: "army" },
    { type: "RESUME_ARMY", armyId: "army" },
    { type: "STOP_ARMY", armyId: "army" },
    { type: "START_ALL" },
    { type: "PAUSE_ALL" },
    { type: "RESUME_ALL" },
    { type: "STOP_ALL" },
    { type: "RENAME_SIDE", sideId: "red", name: "Алые" },
    { type: "DELETE_SIDE", sideId: "red", strategy: "UNREGISTER_ARMIES" },
    { type: "DELETE_SIDE", sideId: "red", strategy: "REASSIGN_ARMIES", targetSideId: "blue" },
    { type: "SET_RELATION", leftSideId: "red", rightSideId: "blue", relation: "ENEMY" },
    { type: "UPDATE_SETTINGS", settings: { defaultSpeedCellsPerSecond: 1, interpolationEnabled: false } },
    { type: "UPDATE_ARMY_OVERRIDES", armyId: "army", overrides: { maxRouteDistanceCells: 8 } },
    { type: "MOVE_ARMY", armyId: "army", position: { x: 1, y: 2 } },
    {
      type: "CREATE_BARRIER",
      itemId: "barrier",
      barrier: {
        version: 1,
        revision: 0,
        blocksMovement: true,
        blocksVision: false,
        visibility: "GM_ONLY",
        color: "#f00"
      }
    },
    { type: "UPDATE_BARRIER", itemId: "barrier", barrier: { blocksVision: true } },
    { type: "DELETE_BARRIER", itemId: "barrier" },
    { type: "RENAME_BATTLE_GROUP", battleId: "battle", name: "Переправа" },
    { type: "RELEASE_BATTLE_GROUP", battleId: "battle" },
    { type: "REMOVE_BATTLE_PARTICIPANT", battleId: "battle", armyId: "army" },
    { type: "DEFER_TURN", until: "2026-09-03T15:00:00.000Z" },
    { type: "CANCEL_TURN_DEFERRAL" },
    { type: "PAUSE_AUTO_TURNS" },
    { type: "RESUME_AUTO_TURNS" },
    { type: "COMPLETE_TURN_NOW" }
  ])("accepts supported command $type", (payload) => {
    expect(validateArmyCommand(envelope(payload))).toMatchObject({ ok: true });
  });

  it.each([
    { type: "ASSIGN_BATTLE_PLAYER", battleId: "battle", playerId: "player", armyId: "army" },
    { type: "RECORD_BATTLE_DEATH", battleId: "battle", playerId: "player" }
  ])("rejects removed Minecraft battle command $type", (payload) => {
    expect(validateArmyCommand(envelope(payload))).toMatchObject({ ok: false });
  });

  it.each([
    { type: "DELETE_SIDE", sideId: "red", strategy: "REASSIGN_ARMIES" },
    { type: "SET_RELATION", leftSideId: "red", rightSideId: "blue", relation: "FRIEND" },
    { type: "UPDATE_SETTINGS", settings: { movementUpdateRate: 0 } },
    { type: "UPDATE_ARMY_OVERRIDES", armyId: "army", overrides: { speedCellsPerSecond: -1 } },
    { type: "MOVE_ARMY", armyId: "army", position: { x: Infinity, y: 0 } },
    { type: "DEFER_TURN", until: "not-a-date" },
    { type: "CREATE_BARRIER", itemId: "barrier", barrier: { version: 2 } },
    { type: "REMOVE_BATTLE_PARTICIPANT", battleId: "battle" }
  ])("rejects malformed supported command $type", (payload) => {
    expect(validateArmyCommand(envelope(payload))).toMatchObject({
      ok: false,
      reason: "INVALID_COMMAND"
    });
  });
});
