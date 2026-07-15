import { describe, expect, it, vi } from "vitest";
import {
  CoordinatorLease,
  electCoordinator,
  resolveCoordinatorConnectionId
} from "./coordinator";

describe("GM coordinator", () => {
  it("elects the lexically smallest connected GM connection", () => {
    expect(
      electCoordinator([
        { connectionId: "z", role: "GM" },
        { connectionId: "a", role: "GM" },
        { connectionId: "0", role: "PLAYER" }
      ])
    ).toBe("a");
  });

  it("prefers a live non-expired persisted lease over lexical election", () => {
    expect(resolveCoordinatorConnectionId(
      [
        { connectionId: "a", role: "GM" },
        { connectionId: "z", role: "GM" }
      ],
      { connectionId: "z", epoch: 3, expiresAt: 11_000 },
      10_000
    )).toBe("z");
  });

  it("fails over from an expired holder to the next live GM", () => {
    expect(resolveCoordinatorConnectionId(
      [
        { connectionId: "a", role: "GM" },
        { connectionId: "b", role: "GM" }
      ],
      { connectionId: "a", epoch: 3, expiresAt: 9_999 },
      10_000
    )).toBe("b");
  });

  it("falls back to live election when the persisted holder disconnected", () => {
    expect(resolveCoordinatorConnectionId(
      [{ connectionId: "b", role: "GM" }],
      { connectionId: "gone", epoch: 3, expiresAt: 11_000 },
      10_000
    )).toBe("b");
  });

  it("writes a one-second heartbeat with a three-second expiry only when elected", async () => {
    const write = vi.fn(async () => undefined);
    const lease = new CoordinatorLease({
      currentConnectionId: async () => "a",
      now: () => 10_000,
      participants: async () => [
        { connectionId: "b", role: "GM" },
        { connectionId: "a", role: "GM" }
      ],
      readHeartbeat: async () => undefined,
      writeHeartbeat: write
    });
    await lease.tick();
    expect(lease.isCoordinator()).toBe(true);
    expect(write).toHaveBeenCalledWith({ connectionId: "a", epoch: 1, expiresAt: 13_000 });
  });

  it("never overlaps coordinator ticks and coalesces one pending tick", async () => {
    let release: (() => void) | undefined;
    let call = 0;
    const participants = vi.fn(() => {
      call += 1;
      return call === 1
        ? new Promise<readonly { connectionId: string; role: "GM" }[]>((resolve) => {
            release = () => resolve([{ connectionId: "a", role: "GM" }]);
          })
        : Promise.resolve([{ connectionId: "a", role: "GM" }] as const);
    });
    const lease = new CoordinatorLease({
      currentConnectionId: async () => "a",
      now: () => 10_000,
      participants,
      readHeartbeat: async () => undefined,
      writeHeartbeat: vi.fn(async () => undefined)
    });

    const first = lease.tick();
    const second = lease.tick();
    const third = lease.tick();
    expect(participants).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second, third]);
    expect(participants).toHaveBeenCalledTimes(2);
  });

  it("waits for an in-flight heartbeat during stop", async () => {
    let releaseWrite: (() => void) | undefined;
    const writeHeartbeat = vi.fn(() => new Promise<void>((resolve) => {
      releaseWrite = resolve;
    }));
    const lease = new CoordinatorLease({
      currentConnectionId: async () => "a",
      now: () => 10_000,
      participants: async () => [{ connectionId: "a", role: "GM" }],
      readHeartbeat: async () => undefined,
      writeHeartbeat
    });
    lease.start();
    await vi.waitFor(() => expect(writeHeartbeat).toHaveBeenCalledTimes(1));

    let stopped = false;
    const stopWork = Promise.resolve(lease.stop()).then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    releaseWrite?.();
    await stopWork;
    expect(stopped).toBe(true);
    expect(lease.isCoordinator()).toBe(false);
  });

  it("reads the current connection ID on every heartbeat", async () => {
    let connectionId = "old";
    const writes: string[] = [];
    const lease = new CoordinatorLease({
      currentConnectionId: async () => connectionId,
      now: () => 10_000,
      participants: async () => [{ connectionId, role: "GM" }],
      readHeartbeat: async () => undefined,
      writeHeartbeat: async (heartbeat) => { writes.push(heartbeat.connectionId); }
    });

    await lease.tick();
    connectionId = "new";
    await lease.tick();

    expect(writes).toEqual(["old", "new"]);
  });
});
