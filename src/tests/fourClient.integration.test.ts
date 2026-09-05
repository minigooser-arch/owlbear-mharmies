import { describe, expect, it } from "vitest";
import {
  CommandGateway,
  type BroadcastEvent,
  type BroadcastPort
} from "../commands/commandGateway";
import {
  dispatchBackgroundCommand,
  sendCommandAck
} from "../background/application";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand } from "../shared/types";
import {
  addLeader,
  addMember,
  fourClientRoom,
  registerArmy,
  setRoute
} from "./helpers/factories";
import { createFourClientRoom } from "./helpers/inMemoryAdapter";

class InMemoryBroadcastHub {
  private readonly listeners = new Map<string, Set<(event: BroadcastEvent) => void>>();

  port(connectionId: string): BroadcastPort {
    return {
      send: async (channel, data) => {
        for (const listener of this.listeners.get(channel) ?? []) {
          listener({ connectionId, data: structuredClone(data) });
        }
      },
      on: (channel, listener) => {
        const listeners = this.listeners.get(channel) ?? new Set();
        listeners.add(listener);
        this.listeners.set(channel, listeners);
        return () => listeners.delete(listener);
      }
    };
  }
}

describe("four-client room", () => {
  it("delivers a v2 command through the real gateway and background dispatcher", async () => {
    const hub = new InMemoryBroadcastHub();
    const clientPort = hub.port("player-connection");
    const backgroundPort = hub.port("gm-connection");
    const gateway = new CommandGateway(clientPort, 1_000, async () => "gm-connection");
    gateway.start();
    const unsubscribe = backgroundPort.on(CommandGateway.COMMAND_CHANNEL, (event) => {
      void dispatchBackgroundCommand({
        event,
        participants: [
          { id: "gm", connectionId: "gm-connection", role: "GM" },
          { id: "player", connectionId: "player-connection", role: "PLAYER" }
        ],
        currentConnectionId: "gm-connection",
        lease: { connectionId: "gm-connection", epoch: 1, expiresAt: Date.now() + 3_000 },
        now: Date.now(),
        ready: true,
        active: true,
        sendAck: (acknowledgement) => sendCommandAck(backgroundPort, acknowledgement),
        process: async (sender) => sendCommandAck(backgroundPort, {
          requestId: (event.data as ArmyCommand).requestId,
          status: "ACCEPTED",
          coordinatorConnectionId: "gm-connection",
          recipientConnectionId: sender.connectionId
        })
      });
    });

    const acknowledgement = await gateway.send({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "integration-request",
      senderPlayerId: "player",
      senderConnectionId: "player-connection",
      expectedRevision: 1,
      type: "START_ALL"
    });

    expect(acknowledgement).toMatchObject({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      status: "ACCEPTED",
      coordinatorConnectionId: "gm-connection"
    });
    unsubscribe();
    gateway.stop();
  });

  it("keeps C uninformed while A and B detect, move, collide, and enter battle", async () => {
    const room = createFourClientRoom();
    await room.registerArmies();
    room.setEnemy("A", "B");
    await room.setRoutesTowardEachOther(5);
    expect(await room.visibleTo("C")).toEqual(new Set(["c-army"]));
    room.globalStart();
    await room.advanceUntilContact();
    expect(await room.visibleTo("A")).toContain("b-army");
    expect(await room.visibleTo("B")).toContain("a-army");
    expect(await room.visibleTo("C")).toEqual(new Set(["c-army"]));
    expect(room.status("a-army")).toBe("IN_BATTLE");
    expect(room.status("b-army")).toBe("IN_BATTLE");
  });

  it("handles vision and movement barriers, reload, and coordinator loss", async () => {
    const room = createFourClientRoom();
    await room.registerArmies();
    room.setEnemy("A", "B");
    room.addVisionWall(2.5);
    expect(await room.visibleTo("A")).not.toContain("b-army");
    room.setVisionException("a-army", true);
    expect(await room.visibleTo("A")).toContain("b-army");
    expect(await room.reloadLocalClones("A")).toBe(2);
    expect(await room.reloadLocalClones("A")).toBe(2);
    await room.setRoutesTowardEachOther(5);
    room.addMovementWall(1);
    room.globalStart();
    await room.advance(1);
    expect(room.status("a-army")).toBe("PAUSED");
    room.loseCoordinator();
    expect(room.status("b-army")).toBe("PAUSED");
  });

  it("supports leaders, registration, private planning, and started-side visibility", async () => {
    const room = fourClientRoom();
    await room.gm.send(addLeader("red", "leader-1"));
    await room.gm.send(addLeader("red", "leader-2"));
    await room.leader1.send(addMember("red", "member"));
    await room.gm.send(registerArmy("red-token", "red"));
    await room.leader2.send(setRoute("red-token", [{ x: 2, y: 0 }]));

    expect(await room.gm.routeIds()).toContain("red-token");
    expect(await room.leader1.routeIds()).toContain("red-token");
    expect(await room.member.routeIds()).not.toContain("red-token");
    expect(await room.other.routeIds()).not.toContain("red-token");

    await room.gm.send({ type: "COMPLETE_MOVEMENT_PHASE" });
    await room.gm.send({ type: "COMPLETE_TURN_NOW" });
    expect(await room.member.routeIds()).toContain("red-token");
    expect(await room.other.routeIds()).not.toContain("red-token");
  });
});
