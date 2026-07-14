import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, METADATA_KEYS } from "../shared/constants";
import type { ArmyCommand, ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function army(sideId: string, directOwnerPlayerId?: string): ArmyState {
  return {
    version: 1,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1,
    ...(directOwnerPlayerId ? { directOwnerPlayerId } : {})
  };
}

function image(id: string, registered = false): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    name: id,
    position: { x: 0, y: 0 },
    metadata: registered ? { [METADATA_KEYS.army]: army("red") } : {}
  };
}

function state(): CommandState {
  const scene: SceneState = {
    version: 2,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
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
    ],
    relations: {},
    battleGroups: []
  };
  return {
    scene,
    armies: {
      "army-red": army("red", "legacy-owner"),
      "registered-image": army("red")
    },
    barriers: {},
    items: {
      "army-red": image("army-red", true),
      "candidate-image": image("candidate-image"),
      "registered-image": image("registered-image", true),
      shape: { id: "shape", type: "SHAPE", position: { x: 0, y: 0 }, metadata: {} }
    }
  } as CommandState;
}

function command(
  overrides: Partial<ArmyCommand> & Pick<ArmyCommand, "type">,
  senderPlayerId = "gm"
): ArmyCommand {
  return {
    requestId: "request",
    senderPlayerId,
    senderConnectionId: `${senderPlayerId}-connection`,
    expectedRevision: 2,
    ...overrides
  } as ArmyCommand;
}

function context(
  role: "GM" | "PLAYER",
  playerId: string,
  commandState = state(),
  connectedPlayerIds = new Set(["gm", "leader", "member", "legacy-owner", "blue-leader", "leader-2"])
): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds,
    state: commandState
  };
}

describe("CommandProcessor", () => {
  const processor = new CommandProcessor();

  it("rejects a forged sender connection before changing state", () => {
    const result = processor.execute(
      { ...context("GM", "gm"), connectionId: "real-connection" },
      command({
        type: "CREATE_SIDE",
        side: {
          id: "green",
          name: "Зелёные",
          color: "#0f0",
          playerIds: [],
          leaderPlayerIds: []
        }
      })
    );
    expect(result).toEqual({ status: "REJECTED", reason: "FORGED_CONNECTION" });
  });

  it("reports a stale revision as a conflict", () => {
    expect(
      processor.execute(context("GM", "gm"), command({ type: "START_ALL", expectedRevision: 1 }))
    ).toEqual({ status: "CONFLICT", actualRevision: 2 });
  });

  it("assigns multiple leaders by id and automatically makes them members", () => {
    const first = processor.execute(
      context("GM", "gm"),
      command({ type: "ADD_SIDE_LEADER", sideId: "red", playerId: "leader-2" })
    );
    expect(first.status).toBe("ACCEPTED");
    if (first.status !== "ACCEPTED") return;

    const second = processor.execute(
      context("GM", "gm", first.state),
      command({
        type: "ADD_SIDE_LEADER",
        sideId: "red",
        playerId: "leader-2",
        expectedRevision: 3
      })
    );
    expect(second.status).toBe("ACCEPTED");
    if (second.status === "ACCEPTED") {
      expect(second.state.scene.sides.find((side) => side.id === "red")).toMatchObject({
        playerIds: ["leader", "member", "legacy-owner", "leader-2"],
        leaderPlayerIds: ["leader", "leader-2"]
      });
    }
  });

  it("removes leadership without removing ordinary membership", () => {
    const commandState = state();
    commandState.scene.sides[0]?.leaderPlayerIds.push("leader-2");
    commandState.scene.sides[0]?.playerIds.push("leader-2");

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "REMOVE_SIDE_LEADER", sideId: "red", playerId: "leader-2" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides.find((side) => side.id === "red")).toMatchObject({
        playerIds: expect.arrayContaining(["leader-2"]),
        leaderPlayerIds: ["leader"]
      });
    }
  });

  it("lets a leader add an ordinary connected player to a led side", () => {
    const result = processor.execute(
      context("PLAYER", "leader"),
      command({ type: "ADD_SIDE_PLAYER", sideId: "red", playerId: "leader-2" }, "leader")
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides.find((side) => side.id === "red")?.playerIds).toContain(
        "leader-2"
      );
    }
  });

  it("rejects leader membership changes for another side", () => {
    expect(
      processor.execute(
        context("PLAYER", "leader"),
        command({ type: "ADD_SIDE_PLAYER", sideId: "blue", playerId: "member" }, "leader")
      )
    ).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });
  });

  it("does not remove a member while that player remains a leader", () => {
    expect(
      processor.execute(
        context("GM", "gm"),
        command({ type: "REMOVE_SIDE_PLAYER", sideId: "red", playerId: "leader" })
      )
    ).toEqual({ status: "REJECTED", reason: "PLAYER_IS_LEADER" });
  });

  it("rejects adding an arbitrary disconnected player id", () => {
    expect(
      processor.execute(
        context("PLAYER", "leader"),
        command({ type: "ADD_SIDE_PLAYER", sideId: "red", playerId: "invented-id" }, "leader")
      )
    ).toEqual({ status: "REJECTED", reason: "PLAYER_NOT_CONNECTED" });
  });

  it.each([
    ["missing", "ITEM_NOT_FOUND"],
    ["shape", "IMAGE_REQUIRED"],
    ["registered-image", "ALREADY_REGISTERED"]
  ])("authoritatively rejects registration for %s", (itemId, reason) => {
    expect(
      processor.execute(
        context("GM", "gm"),
        command({ type: "REGISTER_ARMY", itemId, sideId: "red" })
      )
    ).toEqual({ status: "REJECTED", reason });
  });

  it("registers an Image for a side without a direct owner", () => {
    const result = processor.execute(
      context("GM", "gm"),
      command({ type: "REGISTER_ARMY", itemId: "candidate-image", sideId: "red" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.armies["candidate-image"]).toMatchObject({ sideId: "red", status: "READY" });
      expect(result.state.armies["candidate-image"]).not.toHaveProperty("directOwnerPlayerId");
    }
  });

  it("keeps movement GM-only even for a legacy direct owner", () => {
    expect(
      processor.execute(
        context("PLAYER", "legacy-owner"),
        command({ type: "START_ARMY", armyId: "army-red" }, "legacy-owner")
      )
    ).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });
});
