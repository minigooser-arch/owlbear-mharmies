import { describe, expect, it, vi } from "vitest";
import { createRefreshCoordinator } from "./refreshCoordinator";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function waitForCallCount(mock: ReturnType<typeof vi.fn>, count: number): Promise<void> {
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(count));
}

describe("refresh coordinator", () => {
  it("runs one active load and coalesces a burst into one trailing load", async () => {
    const loads: Deferred<number>[] = [];
    const load = vi.fn(() => {
      const next = deferred<number>();
      loads.push(next);
      return next.promise;
    });
    const publish = vi.fn();
    const coordinator = createRefreshCoordinator(load, publish, Object.is);

    coordinator.request();
    coordinator.request();
    coordinator.request();

    expect(load).toHaveBeenCalledTimes(1);
    loads[0]?.resolve(1);
    await waitForCallCount(load, 2);
    expect(publish).not.toHaveBeenCalled();

    loads[1]?.resolve(2);
    await coordinator.whenIdle();

    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(2);
  });

  it("never publishes an active result invalidated by a newer request", async () => {
    const first = deferred<{ value: string }>();
    const second = deferred<{ value: string }>();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const publish = vi.fn();
    const coordinator = createRefreshCoordinator(
      load,
      publish,
      (left, right) => left.value === right.value
    );

    coordinator.request();
    coordinator.request();
    first.resolve({ value: "old" });
    await waitForCallCount(load, 2);
    second.resolve({ value: "new" });
    await coordinator.whenIdle();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith({ value: "new" });
  });

  it("does not republish a semantically unchanged result", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ value: "same", transient: 1 })
      .mockResolvedValueOnce({ value: "same", transient: 2 });
    const publish = vi.fn();
    const coordinator = createRefreshCoordinator(
      load,
      publish,
      (left, right) => left.value === right.value
    );

    coordinator.request();
    await coordinator.whenIdle();
    coordinator.request();
    await coordinator.whenIdle();

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("stop invalidates an in-flight load and suppresses late publication", async () => {
    const active = deferred<number>();
    const publish = vi.fn();
    const coordinator = createRefreshCoordinator(() => active.promise, publish, Object.is);

    coordinator.request();
    coordinator.stop();
    active.resolve(1);
    await coordinator.whenIdle();

    expect(publish).not.toHaveBeenCalled();
  });
});
