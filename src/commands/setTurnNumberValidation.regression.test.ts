import { expect, it } from "vitest";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import { validateArmyCommand } from "./commandValidation";

function envelope(turnNumber: number) {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "set-turn",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 3,
    type: "SET_TURN_NUMBER",
    turnNumber
  };
}

it("accepts a positive integer manual turn number", () => {
  const result = validateArmyCommand(envelope(1));
  expect(result).toMatchObject({
    ok: true,
    command: { type: "SET_TURN_NUMBER", turnNumber: 1 }
  });
});

it("rejects zero and fractional manual turn numbers", () => {
  expect(validateArmyCommand(envelope(0))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  expect(validateArmyCommand(envelope(1.5))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
});
