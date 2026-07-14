import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import type { ArmyCommand, SceneState } from "../shared/types";
import { CommandProcessor, type CommandState } from "./commandProcessor";

function state(): CommandState {
  const scene: SceneState = {
    version: 1,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["owner"] }],
    relations: {},
    battleGroups: []
  };
  return { scene, armies: {}, barriers: {} };
}

function command(overrides: Partial<ArmyCommand> & Pick<ArmyCommand, "type">): ArmyCommand {
  return {
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 2,
    ...overrides
  } as ArmyCommand;
}

describe("CommandProcessor", () => {
  it("rejects a forged sender connection before changing state", () => {
    const result = new CommandProcessor().execute(
      {
        role: "GM",
        playerId: "gm",
        connectionId: "real-connection",
        connectedPlayerIds: new Set(["gm"]),
        state: state()
      },
      command({ type: "CREATE_SIDE", side: { id: "blue", name: "Синие", color: "#00f", playerIds: [] } })
    );
    expect(result).toEqual({ status: "REJECTED", reason: "FORGED_CONNECTION" });
  });

  it("reports a stale revision as a conflict", () => {
    const result = new CommandProcessor().execute(
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"]),
        state: state()
      },
      command({ type: "START_ALL", expectedRevision: 1 })
    );
    expect(result).toEqual({ status: "CONFLICT", actualRevision: 2 });
  });

  it("creates a side and commits one new scene revision", () => {
    const result = new CommandProcessor().execute(
      {
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"]),
        state: state()
      },
      command({ type: "CREATE_SIDE", side: { id: "blue", name: "Синие", color: "#00f", playerIds: [] } })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.revision).toBe(3);
      expect(result.state.scene.sides.map((side) => side.id)).toEqual(["red", "blue"]);
    }
  });
});
