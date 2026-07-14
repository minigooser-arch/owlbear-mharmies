import { describe, expect, it } from "vitest";
import { validateArmyCommand } from "./commandValidation";

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return {
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

  it("recovers a valid request id from a malformed payload", () => {
    expect(validateArmyCommand(envelope({ type: "CREATE_SIDE" }))).toEqual({
      ok: false,
      requestId: "request-1",
      reason: "INVALID_COMMAND"
    });
  });

  it.each([
    envelope({ type: "SET_ROUTE", armyId: "army", route: [{ x: Number.NaN, y: 0 }] }),
    envelope({ type: "SET_ROUTE", armyId: "army", route: new Array(1) }),
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
    { type: "SET_ROUTE", armyId: "army", route: [{ x: 1, y: 2 }] },
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
    { type: "RELEASE_BATTLE_GROUP", battleId: "battle" },
    { type: "REMOVE_BATTLE_PARTICIPANT", battleId: "battle", armyId: "army" }
  ])("accepts supported command $type", (payload) => {
    expect(validateArmyCommand(envelope(payload))).toMatchObject({ ok: true });
  });

  it.each([
    { type: "DELETE_SIDE", sideId: "red", strategy: "REASSIGN_ARMIES" },
    { type: "SET_RELATION", leftSideId: "red", rightSideId: "blue", relation: "FRIEND" },
    { type: "UPDATE_SETTINGS", settings: { movementUpdateRate: 0 } },
    { type: "UPDATE_ARMY_OVERRIDES", armyId: "army", overrides: { speedCellsPerSecond: -1 } },
    { type: "MOVE_ARMY", armyId: "army", position: { x: Infinity, y: 0 } },
    { type: "CREATE_BARRIER", itemId: "barrier", barrier: { version: 2 } },
    { type: "REMOVE_BATTLE_PARTICIPANT", battleId: "battle" }
  ])("rejects malformed supported command $type", (payload) => {
    expect(validateArmyCommand(envelope(payload))).toMatchObject({
      ok: false,
      reason: "INVALID_COMMAND"
    });
  });
});
