import { describe, expect, it } from "vitest";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import { validateArmyCommand } from "./commandValidation";

function command(cells: Array<{ x: number; y: number }>, finalFacing?: "NORTH" | "EAST" | "SOUTH" | "WEST") {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "ship-final-turn",
    senderPlayerId: "leader",
    senderConnectionId: "connection",
    expectedRevision: 7,
    type: "SET_SHIP_ROUTE",
    shipId: "ship",
    startCell: { x: 0, y: 0 },
    cells,
    ...(finalFacing ? { finalFacing } : {})
  };
}

describe("SET_SHIP_ROUTE final-facing validation", () => {
  it("accepts a turn-only command", () => {
    expect(validateArmyCommand(command([], "WEST"))).toMatchObject({
      ok: true,
      command: {
        type: "SET_SHIP_ROUTE",
        shipId: "ship",
        cells: [],
        finalFacing: "WEST"
      }
    });
  });

  it("rejects an empty route without a final facing", () => {
    expect(validateArmyCommand(command([]))).toMatchObject({
      ok: false,
      reason: "INVALID_COMMAND"
    });
  });

  it("rejects an invalid final facing", () => {
    expect(validateArmyCommand({ ...command([]), finalFacing: "UP" })).toMatchObject({
      ok: false,
      reason: "INVALID_COMMAND"
    });
  });
});
