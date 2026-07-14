import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./constants";
import type { ArmyCommand, ArmyState, Side } from "./types";
import { authorizeArmyCommand } from "./permissions";

const redArmy: ArmyState = {
  version: 1,
  registered: true,
  sideId: "red",
  status: "READY",
  overrides: {},
  route: [],
  currentWaypointIndex: 0,
  segmentProgressCells: 0,
  ignoresMovementBarriers: false,
  ignoresVisionBarriers: false,
  revision: 1,
  directOwnerPlayerId: "legacy-owner"
};

const blueArmy: ArmyState = { ...redArmy, sideId: "blue" };

const sides: Side[] = [
  {
    id: "red",
    name: "Красные",
    color: "#f00",
    playerIds: ["leader", "member", "legacy-owner"],
    leaderPlayerIds: ["leader"]
  },
  {
    id: "blue",
    name: "Синие",
    color: "#00f",
    playerIds: ["blue-leader"],
    leaderPlayerIds: ["blue-leader"]
  }
];

function command(
  type: ArmyCommand["type"],
  senderPlayerId: string,
  fields: Record<string, unknown> = {}
): ArmyCommand {
  return {
    type,
    requestId: "request",
    senderPlayerId,
    senderConnectionId: `connection-${senderPlayerId}`,
    expectedRevision: 1,
    ...fields
  } as ArmyCommand;
}

function playerContext(playerId: string) {
  return {
    role: "PLAYER" as const,
    playerId,
    armies: new Map([
      ["army-red", redArmy],
      ["army-blue", blueArmy]
    ]),
    sides,
    settings: {
      ...DEFAULT_SETTINGS,
      allowPlayersToCreateRoutes: false,
      allowPlayersToStartOwnArmies: true
    },
    connectedPlayerIds: new Set(["leader", "member", "legacy-owner", "blue-leader"])
  };
}

describe("command authorization", () => {
  it("allows a side leader to edit only that side's route", () => {
    expect(
      authorizeArmyCommand(
        playerContext("leader"),
        command("SET_ROUTE", "leader", { armyId: "army-red", route: [{ x: 1, y: 0 }] })
      )
    ).toEqual({ allowed: true });

    expect(
      authorizeArmyCommand(
        playerContext("leader"),
        command("CLEAR_ROUTE", "leader", { armyId: "army-blue" })
      )
    ).toEqual({ allowed: false, reason: "NOT_SIDE_LEADER" });
  });

  it("lets a leader manage ordinary members only on a led side", () => {
    expect(
      authorizeArmyCommand(
        playerContext("leader"),
        command("ADD_SIDE_PLAYER" as ArmyCommand["type"], "leader", {
          sideId: "red",
          playerId: "member"
        })
      )
    ).toEqual({ allowed: true });

    expect(
      authorizeArmyCommand(
        playerContext("leader"),
        command("REMOVE_SIDE_PLAYER" as ArmyCommand["type"], "leader", {
          sideId: "blue",
          playerId: "blue-leader"
        })
      )
    ).toEqual({ allowed: false, reason: "NOT_SIDE_LEADER" });
  });

  it("keeps every movement and leadership command GM-only", () => {
    expect(
      authorizeArmyCommand(
        playerContext("leader"),
        command("START_ARMY", "leader", { armyId: "army-red" })
      )
    ).toEqual({ allowed: false, reason: "GM_ONLY" });

    expect(
      authorizeArmyCommand(
        playerContext("leader"),
        command("ADD_SIDE_LEADER" as ArmyCommand["type"], "leader", {
          sideId: "red",
          playerId: "member"
        })
      )
    ).toEqual({ allowed: false, reason: "GM_ONLY" });
  });

  it("ignores legacy direct ownership for authorization", () => {
    expect(
      authorizeArmyCommand(
        playerContext("legacy-owner"),
        command("SET_ROUTE", "legacy-owner", { armyId: "army-red", route: [] })
      )
    ).toEqual({ allowed: false, reason: "NOT_SIDE_LEADER" });
  });

  it("rejects a forged internal sender id", () => {
    expect(
      authorizeArmyCommand(
        playerContext("member"),
        command("SET_ROUTE", "leader", { armyId: "army-red", route: [] })
      )
    ).toEqual({ allowed: false, reason: "SENDER_MISMATCH" });
  });
});
