import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./constants";
import type { ArmyCommand, ArmyState } from "./types";
import { authorizeArmyCommand } from "./permissions";

const ownedArmy: ArmyState = {
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
  directOwnerPlayerId: "owner"
};

function routeCommand(senderPlayerId: string): ArmyCommand {
  return {
    type: "SET_ROUTE",
    requestId: "request",
    senderPlayerId,
    senderConnectionId: `connection-${senderPlayerId}`,
    expectedRevision: 1,
    armyId: "army-a",
    route: [{ x: 1, y: 0 }]
  };
}

describe("command authorization", () => {
  it("allows an owner route command but rejects another side member", () => {
    const base = {
      role: "PLAYER" as const,
      armies: new Map([["army-a", ownedArmy]]),
      settings: DEFAULT_SETTINGS,
      connectedPlayerIds: new Set(["owner", "member"])
    };
    expect(authorizeArmyCommand({ ...base, playerId: "owner" }, routeCommand("owner"))).toEqual({ allowed: true });
    expect(authorizeArmyCommand({ ...base, playerId: "member" }, routeCommand("member"))).toEqual({
      allowed: false,
      reason: "NOT_DIRECT_OWNER"
    });
  });

  it("keeps registration and global movement GM-only", () => {
    const context = {
      role: "PLAYER" as const,
      playerId: "owner",
      armies: new Map([["army-a", ownedArmy]]),
      settings: DEFAULT_SETTINGS,
      connectedPlayerIds: new Set(["owner"])
    };
    expect(
      authorizeArmyCommand(context, {
        type: "START_ALL",
        requestId: "r",
        senderPlayerId: "owner",
        senderConnectionId: "c",
        expectedRevision: 1
      })
    ).toEqual({ allowed: false, reason: "GM_ONLY" });
  });
});
