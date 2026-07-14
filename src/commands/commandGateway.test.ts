import { expect, it } from "vitest";
import type { ArmyCommand } from "../shared/types";
import { CommandGateway, type BroadcastEvent, type BroadcastPort } from "./commandGateway";

class MemoryBroadcast implements BroadcastPort {
  listeners = new Map<string, Set<(event: BroadcastEvent) => void>>();
  sent: Array<{ channel: string; data: unknown }> = [];

  async send(channel: string, data: unknown): Promise<void> {
    this.sent.push({ channel, data });
  }

  on(channel: string, listener: (event: BroadcastEvent) => void): () => void {
    const listeners = this.listeners.get(channel) ?? new Set();
    listeners.add(listener);
    this.listeners.set(channel, listeners);
    return () => listeners.delete(listener);
  }

  emit(channel: string, event: BroadcastEvent): void {
    for (const listener of this.listeners.get(channel) ?? []) listener(event);
  }
}

it("resolves only an ack whose coordinator connection matches the event", async () => {
  const port = new MemoryBroadcast();
  const gateway = new CommandGateway(port, 1_000);
  gateway.start();
  const command = {
    type: "START_ALL",
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "sender",
    expectedRevision: 1
  } satisfies ArmyCommand;
  const pending = gateway.send(command);
  port.emit(CommandGateway.ACK_CHANNEL, {
    connectionId: "forged",
    data: { requestId: "request", status: "ACCEPTED", coordinatorConnectionId: "real" }
  });
  port.emit(CommandGateway.ACK_CHANNEL, {
    connectionId: "real",
    data: { requestId: "request", status: "ACCEPTED", coordinatorConnectionId: "real" }
  });
  await expect(pending).resolves.toMatchObject({ status: "ACCEPTED" });
  gateway.stop();
});
