import { expect, it, vi } from "vitest";
import { SubscriptionManager } from "./subscriptions";

it("unsubscribes every listener exactly once", () => {
  const first = vi.fn();
  const second = vi.fn();
  const manager = new SubscriptionManager();
  manager.add(first);
  manager.add(second);
  expect(manager.size).toBe(2);
  manager.clear();
  manager.clear();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(manager.size).toBe(0);
});
