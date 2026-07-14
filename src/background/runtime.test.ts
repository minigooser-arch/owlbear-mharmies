import { describe, expect, it, vi } from "vitest";
import { BackgroundRuntime, type BackgroundRuntimePort } from "./runtime";

class RuntimePort implements BackgroundRuntimePort {
  subscriptions = new Set<() => void>();
  sceneReady: ((ready: boolean) => void) | undefined;
  coordinator: ((active: boolean) => void) | undefined;
  deleted = 0;
  paused = 0;
  movement = vi.fn<() => Promise<void>>(async () => undefined);
  visibility = vi.fn<() => Promise<void>>(async () => undefined);

  private subscribe(setter: (callback: never) => void, callback: never): () => void {
    setter(callback);
    const unsubscribe = () => this.subscriptions.delete(unsubscribe);
    this.subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  onSceneReady(callback: (ready: boolean) => void) {
    return this.subscribe((value) => { this.sceneReady = value; }, callback as never);
  }
  onCoordinatorChange(callback: (active: boolean) => void) {
    return this.subscribe((value) => { this.coordinator = value; }, callback as never);
  }
  onSceneItemsChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onLocalItemsChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onSceneMetadataChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onGridChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onPlayerChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onPartyChange(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  onBroadcast(callback: () => void) { void callback; return this.subscribe(() => undefined, (() => undefined) as never); }
  async deleteLocalOverlays() { this.deleted += 1; }
  async pauseMovingArmies() { this.paused += 1; }
  movementTick() { return this.movement(); }
  visibilityTick() { return this.visibility(); }
}

describe("BackgroundRuntime", () => {
  it("unsubscribes every listener and deletes local overlays on scene close", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    expect(port.subscriptions.size).toBeGreaterThan(0);
    port.sceneReady?.(false);
    await runtime.whenIdle();
    expect(port.subscriptions.size).toBe(0);
    expect(port.deleted).toBe(1);
  });

  it("pauses moving armies when coordinator ownership is lost", async () => {
    const port = new RuntimePort();
    const runtime = new BackgroundRuntime(port);
    runtime.start();
    port.coordinator?.(true);
    port.coordinator?.(false);
    await runtime.whenIdle();
    expect(port.paused).toBe(1);
    runtime.stop();
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
    runtime.requestMovementTick();
    runtime.requestMovementTick();
    expect(port.movement).toHaveBeenCalledTimes(1);
    release?.();
    await runtime.whenIdle();
    expect(port.movement).toHaveBeenCalledTimes(2);
    runtime.stop();
  });
});
