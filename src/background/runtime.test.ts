import { describe, expect, it, vi } from "vitest";
import { BackgroundRuntime, type BackgroundRuntimePort } from "./runtime";

class RuntimePort implements BackgroundRuntimePort {
  subscriptions = new Set<() => void>();
  sceneReady: ((ready: boolean) => void) | undefined;
  coordinator: ((active: boolean) => void) | undefined;
  ready = true;
  opened = 0;
  closed = 0;
  closeGate: Promise<void> | undefined;
  openFailure: Error | undefined;
  broadcast: (() => void) | undefined;
  deleted = 0;
  paused = 0;
  movement = vi.fn<() => Promise<void>>(async () => undefined);
  visibility = vi.fn<() => Promise<void>>(async () => undefined);
  turns = vi.fn<() => Promise<void>>(async () => undefined);

  private subscribe(setter: (callback: never) => void, callback: never): () => void {
    setter(callback);
    const unsubscribe = () => this.subscriptions.delete(unsubscribe);
    this.subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  onSceneReady(callback: (ready: boolean) => void) {
    return this.subscribe((value) => { this.sceneReady = value; }, callback as never);
  }
  async isSceneReady() { return this.ready; }
  onSceneOpen() { this.opened += 1; if (this.openFailure) throw this.openFailure; }
  async onSceneClose() { this.closed += 1; await this.closeGate; }
  onCoordinatorChange(callback: (active: boolean) => void) {
    return this.subscribe((value) => { this.coordinator = value; }, callback as never);
  }
  onSceneItemsChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onLocalItemsChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onSceneMetadataChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onGridChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onPlayerChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onPartyChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onBroadcast(callback: () => void) {
    return this.subscribe((value) => { this.broadcast = value; }, callback as never);
  }
  async deleteLocalOverlays() { this.deleted += 1; }
  async pauseMovingArmies() { this.paused += 1; }
  movementTick() { return this.movement(); }
  visibilityTick() { return this.visibility(); }
  turnTick() { return this.turns(); }
}

describe("BackgroundRuntime", () => {
  it("keeps the ready listener and reopens after a scene close", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();
    expect(port.opened).toBe(1);
    expect(port.subscriptions.size).toBeGreaterThan(0);
    port.sceneReady?.(false);
    await runtime.whenIdle();
    expect(port.subscriptions.size).toBe(2);
    expect(port.closed).toBe(1);
    expect(port.deleted).toBe(1);

    port.sceneReady?.(true);
    await runtime.whenIdle();
    expect(port.opened).toBe(2);
    expect(port.subscriptions.size).toBeGreaterThan(1);

    await runtime.stop();
    expect(port.subscriptions.size).toBe(0);
  });

  it("tears down the old scene during a rapid false-to-true transition", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();

    port.sceneReady?.(false);
    port.sceneReady?.(true);
    await runtime.whenIdle();

    expect(port.closed).toBe(1);
    expect(port.deleted).toBe(1);
    expect(port.opened).toBe(2);
    await runtime.stop();
  });

  it("waits for the first ready scene before starting scene work", async () => {
    const port = new RuntimePort();
    port.ready = false;
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();
    expect(port.opened).toBe(0);
    expect(port.subscriptions.size).toBe(2);

    port.sceneReady?.(true);
    await runtime.whenIdle();
    expect(port.opened).toBe(1);
    expect(port.subscriptions.size).toBeGreaterThan(1);
    await runtime.stop();
  });

  it("keeps the command listener active when scene opening fails", async () => {
    const port = new RuntimePort();
    port.openFailure = new Error("preview cleanup failed");
    const runtime = new BackgroundRuntime(port);

    runtime.start();
    await runtime.whenIdle();

    expect(port.opened).toBe(1);
    expect(port.broadcast).toBeTypeOf("function");
    expect(port.subscriptions.size).toBe(2);
    await runtime.stop();
  });

  it("does not open the next scene until old scene work is drained", async () => {
    const port = new RuntimePort();
    let releaseClose: (() => void) | undefined;
    port.closeGate = new Promise<void>((resolve) => { releaseClose = resolve; });
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();

    port.sceneReady?.(false);
    port.sceneReady?.(true);
    await vi.waitFor(() => expect(port.closed).toBe(1));
    expect(port.opened).toBe(1);

    releaseClose?.();
    await runtime.whenIdle();
    expect(port.opened).toBe(2);
    await runtime.stop();
  });

  it("pauses moving armies when coordinator ownership is lost", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();
    port.coordinator?.(true);
    port.coordinator?.(false);
    await runtime.whenIdle();
    expect(port.paused).toBe(1);
    await runtime.stop();
  });

  it("never overlaps slow coordinator movement ticks", async () => {
    const port = new RuntimePort();
    let release: (() => void) | undefined;
    let call = 0;
    port.movement.mockImplementation(() => {
      call += 1;
      return call === 1
        ? new Promise<void>((resolve) => { release = resolve; })
        : Promise.resolve();
    });
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();
    runtime.requestMovementTick();
    runtime.requestMovementTick();
    expect(port.movement).toHaveBeenCalledTimes(1);
    release?.();
    await runtime.whenIdle();
    expect(port.movement).toHaveBeenCalledTimes(2);
    await runtime.stop();
  });

  it("never overlaps slow turn reconciliation ticks", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();
    port.turns.mockClear();

    let release: (() => void) | undefined;
    let call = 0;
    port.turns.mockImplementation(() => {
      call += 1;
      return call === 1
        ? new Promise<void>((resolve) => { release = resolve; })
        : Promise.resolve();
    });

    runtime.requestTurnTick();
    runtime.requestTurnTick();
    expect(port.turns).toHaveBeenCalledTimes(1);
    release?.();
    await runtime.whenIdle();
    expect(port.turns).toHaveBeenCalledTimes(2);
    await runtime.stop();
  });

  it("never overlaps slow visibility ticks and coalesces one pending run", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    await runtime.whenIdle();
    port.visibility.mockClear();

    let release: (() => void) | undefined;
    let call = 0;
    port.visibility.mockImplementation(() => {
      call += 1;
      return call === 1
        ? new Promise<void>((resolve) => { release = resolve; })
        : Promise.resolve();
    });

    runtime.requestVisibilityTick();
    runtime.requestVisibilityTick();
    runtime.requestVisibilityTick();
    expect(port.visibility).toHaveBeenCalledTimes(1);
    release?.();
    await runtime.whenIdle();
    expect(port.visibility).toHaveBeenCalledTimes(2);
    await runtime.stop();
  });
});
