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
});
