import { describe, expect, it } from "vitest";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import { validateArmyCommand } from "./commandValidation";

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1,
    ...payload
  };
}

describe("civil war command validation", () => {
  it("accepts and trims a complete civil war command", () => {
    expect(validateArmyCommand(envelope({
      type: "START_CIVIL_WAR",
      sourceStateId: "empire",
      rebelFactionId: "rebels",
      newStateId: "rebel-state",
      newStateName: "  Республика  ",
      newStateColor: " #aa3344 "
    }))).toMatchObject({
      ok: true,
      command: {
        type: "START_CIVIL_WAR",
        sourceStateId: "empire",
        rebelFactionId: "rebels",
        newStateId: "rebel-state",
        newStateName: "Республика",
        newStateColor: "#aa3344"
      }
    });
  });

  it("rejects incomplete civil war commands", () => {
    expect(validateArmyCommand(envelope({
      type: "START_CIVIL_WAR",
      sourceStateId: "empire",
      rebelFactionId: "rebels",
      newStateId: "rebel-state",
      newStateName: " ",
      newStateColor: "#aa3344"
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });
});
