import { describe, expect, it, vi } from "vitest";
import { CoordinatorLease, electCoordinator } from "./coordinator";

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

  it("writes a one-second heartbeat with a three-second expiry only when elected", async () => {
    const write = vi.fn(async () => undefined);
    const lease = new CoordinatorLease({
      connectionId: "a",
      now: () => 10_000,
      participants: async () => [
        { connectionId: "b", role: "GM" },
        { connectionId: "a", role: "GM" }
      ],
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
      connectionId: "a",
      now: () => 10_000,
      participants,
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
      connectionId: "a",
      now: () => 10_000,
      participants: async () => [{ connectionId: "a", role: "GM" }],
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
});
