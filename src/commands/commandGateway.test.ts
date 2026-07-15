import { describe, expect, it, vi } from "vitest";
import type { ArmyCommand } from "../shared/types";
import {
  CommandGateway,
  DuplicateRequestError,
  type BroadcastEvent,
  type BroadcastPort
} from "./commandGateway";

class MemoryBroadcast implements BroadcastPort {
  listeners = new Map<string, Set<(event: BroadcastEvent) => void>>();
  sent: Array<{ channel: string; data: unknown }> = [];
  coordinatorConnectionId = "real";

  async getSceneMetadata(): Promise<Record<string, unknown>> {
    return {
      "com.letopis.army-control/scene": {
        version: 2,
        coordinatorLease: {
          connectionId: this.coordinatorConnectionId,
          epoch: 1,
          expiresAt: Date.now() + 3_000
        }
      }
    };
  }

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

function command(): ArmyCommand {
  return {
    type: "START_ALL",
    requestId: "request",
    senderPlayerId: "gm",
    senderConnectionId: "sender",
    expectedRevision: 1
  };
}

function accepted(recipientConnectionId = "sender") {
  return {
    requestId: "request",
    status: "ACCEPTED",
    coordinatorConnectionId: "real",
    recipientConnectionId
  } as const;
}

describe("CommandGateway", () => {
  it("ignores a peer ack that self-asserts the peer as coordinator", async () => {
    const port = new MemoryBroadcast();
    const gateway = new CommandGateway(port, 1_000);
    gateway.start();
    const pending = gateway.send(command());
    port.emit(CommandGateway.ACK_CHANNEL, {
      connectionId: "forged",
      data: {
        ...accepted(),
        coordinatorConnectionId: "forged"
      }
    });
    port.emit(CommandGateway.ACK_CHANNEL, {
      connectionId: "real",
      data: accepted()
    });
    await expect(pending).resolves.toMatchObject({
      status: "ACCEPTED",
      coordinatorConnectionId: "real"
    });
    gateway.stop();
  });

  it("ignores an ack addressed to another connection", async () => {
    const port = new MemoryBroadcast();
    const gateway = new CommandGateway(port, 1_000);
    gateway.start();
    const pending = gateway.send(command());
    port.emit(CommandGateway.ACK_CHANNEL, {
      connectionId: "real",
      data: {
        requestId: "request",
        status: "REJECTED",
        reason: "GM_ONLY",
        coordinatorConnectionId: "real",
        recipientConnectionId: "other"
      }
    });
    port.emit(CommandGateway.ACK_CHANNEL, {
      connectionId: "real",
      data: accepted()
    });
    await expect(pending).resolves.toMatchObject({ status: "ACCEPTED" });
    gateway.stop();
  });

  it("ignores status-specific malformed acknowledgements", async () => {
    const port = new MemoryBroadcast();
    const gateway = new CommandGateway(port, 1_000);
    gateway.start();
    const pending = gateway.send(command());
    port.emit(CommandGateway.ACK_CHANNEL, {
      connectionId: "real",
      data: {
        requestId: "request",
        status: "REJECTED",
        coordinatorConnectionId: "real",
        recipientConnectionId: "sender"
      }
    });
    port.emit(CommandGateway.ACK_CHANNEL, {
      connectionId: "real",
      data: accepted()
    });
    await expect(pending).resolves.toMatchObject({ status: "ACCEPTED" });
    gateway.stop();
  });

  it("rejects a duplicate in-flight request id", async () => {
    const port = new MemoryBroadcast();
    const gateway = new CommandGateway(port, 1_000);
    gateway.start();
    const first = gateway.send(command());
    expect(() => gateway.send(command())).toThrow(DuplicateRequestError);
    gateway.stop();
    await expect(first).rejects.toThrow("Command gateway stopped");
  });

  it("rejects a timed-out command with its request id", async () => {
    vi.useFakeTimers();
    try {
      const port = new MemoryBroadcast();
      const gateway = new CommandGateway(port, 100);
      gateway.start();
      const pending = gateway.send(command()).then(
        () => ({ status: "RESOLVED" as const }),
        (error: unknown) => ({ status: "REJECTED" as const, error })
      );

      await vi.advanceTimersByTimeAsync(100);
      const outcome = await pending;
      expect(outcome.status).toBe("REJECTED");
      expect("error" in outcome ? outcome.error : undefined).toMatchObject({
        name: "CommandTimeoutError",
        requestId: "request"
      });
      gateway.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out cleanly when the trusted coordinator lookup fails", async () => {
    vi.useFakeTimers();
    try {
      const port = new MemoryBroadcast();
      const gateway = new CommandGateway(
        port,
        100,
        async () => { throw new Error("metadata unavailable"); }
      );
      gateway.start();
      const pending = gateway.send(command()).then(
        () => ({ status: "RESOLVED" as const }),
        (error: unknown) => ({ status: "REJECTED" as const, error })
      );

      await vi.advanceTimersByTimeAsync(100);

      await expect(pending).resolves.toMatchObject({
        status: "REJECTED",
        error: { name: "CommandTimeoutError", requestId: "request" }
      });
      gateway.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
