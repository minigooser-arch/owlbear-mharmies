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
    version: 3,
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

  it("keeps a player in every side they join", () => {
    const result = processor.execute(
      context("GM", "gm"),
      command({ type: "ADD_SIDE_PLAYER", sideId: "blue", playerId: "member" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides
        .filter((side) => side.playerIds.includes("member"))
        .map((side) => side.id)
        .sort()).toEqual(["blue", "red"]);
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

  it("rejects a crafted player registration without mutating state", () => {
    const playerContext = context("PLAYER", "member");
    const before = structuredClone(playerContext.state);

    expect(processor.execute(
      playerContext,
      command({ type: "REGISTER_ARMY", itemId: "candidate-image", sideId: "red" }, "member")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(playerContext.state).toEqual(before);
  });

  it("rejects a crafted player unregister without mutating state", () => {
    const playerContext = context("PLAYER", "member");
    const before = structuredClone(playerContext.state);

    expect(processor.execute(
      playerContext,
      command({ type: "UNREGISTER_ARMY", armyId: "army-red" }, "member")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(playerContext.state).toEqual(before);
  });

  it("keeps movement GM-only even for a legacy direct owner", () => {
    expect(
      processor.execute(
        context("PLAYER", "legacy-owner"),
        command({ type: "START_ARMY", armyId: "army-red" }, "legacy-owner")
      )
    ).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });

  it.each([
    ["SET_ROUTE", "PLAYER", "leader", "MOVING"],
    ["CLEAR_ROUTE", "PLAYER", "leader", "MOVING"],
    ["SET_ROUTE", "GM", "gm", "MOVING"],
    ["CLEAR_ROUTE", "GM", "gm", "MOVING"],
    ["SET_ROUTE", "PLAYER", "leader", "PAUSED"],
    ["CLEAR_ROUTE", "PLAYER", "leader", "PAUSED"],
    ["SET_ROUTE", "GM", "gm", "PAUSED"],
    ["CLEAR_ROUTE", "GM", "gm", "PAUSED"],
    ["SET_ROUTE", "PLAYER", "leader", "IN_BATTLE"],
    ["CLEAR_ROUTE", "PLAYER", "leader", "IN_BATTLE"],
    ["SET_ROUTE", "GM", "gm", "IN_BATTLE"],
    ["CLEAR_ROUTE", "GM", "gm", "IN_BATTLE"]
  ] as const)(
    "rejects %s by %s %s for an army in %s until the GM stops it",
    (type, role, playerId, status) => {
      const commandState = state();
      const activeArmy = commandState.armies["army-red"];
      if (!activeArmy) throw new Error("Missing test army");
      activeArmy.status = status;
      activeArmy.route = [{ x: 1, y: 0 }];

      const routeCommand = type === "SET_ROUTE"
        ? command({ type, armyId: "army-red", route: [{ x: 2, y: 0 }] }, playerId)
        : command({ type, armyId: "army-red" }, playerId);

      expect(processor.execute(context(role, playerId, commandState), routeCommand)).toEqual({
        status: "REJECTED",
        reason: "ARMY_NOT_READY"
      });
      expect(commandState.armies["army-red"]).toMatchObject({
        status,
        route: [{ x: 1, y: 0 }]
      });
    }
  );

  it("rejects reassigning a deleted side's armies back to the same side", () => {
    expect(processor.execute(
      context("GM", "gm"),
      command({
        type: "DELETE_SIDE",
        sideId: "red",
        strategy: "REASSIGN_ARMIES",
        targetSideId: "red"
      })
    )).toEqual({ status: "REJECTED", reason: "TARGET_SIDE_SAME" });
  });

  it("removes unregistered side armies from battle groups", () => {
    const commandState = state();
    commandState.armies["army-blue"] = army("blue");
    commandState.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "army-blue"],
      revision: 1
    }];

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({
        type: "DELETE_SIDE",
        sideId: "red",
        strategy: "UNREGISTER_ARMIES"
      })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.battleGroups).toEqual([]);
      expect(result.state.armies["army-red"]).toBeUndefined();
      expect(result.state.armies["army-blue"]).toBeDefined();
    }
  });

  it("renames a battle for a GM and trims the stored name", () => {
    const commandState = state();
    commandState.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "registered-image"],
      revision: 1
    }];

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "RENAME_BATTLE_GROUP", battleId: "battle", name: "  Переправа  " })
    );

    expect(result).toMatchObject({
      status: "ACCEPTED",
      state: {
        scene: {
          revision: 3,
          battleGroups: [{ name: "Переправа", revision: 2 }]
        }
      }
    });
  });

  it("rejects a player battle rename without mutating state", () => {
    const playerContext = context("PLAYER", "member");
    playerContext.state.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "registered-image"],
      revision: 1
    }];
    const before = structuredClone(playerContext.state);

    expect(processor.execute(
      playerContext,
      command({ type: "RENAME_BATTLE_GROUP", battleId: "battle", name: "Чужое имя" }, "member")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(playerContext.state).toEqual(before);
  });

  it("rejects renaming a missing battle", () => {
    expect(processor.execute(
      context("GM", "gm"),
      command({ type: "RENAME_BATTLE_GROUP", battleId: "missing", name: "Переправа" })
    )).toEqual({ status: "REJECTED", reason: "BATTLE_NOT_FOUND" });
  });
});
