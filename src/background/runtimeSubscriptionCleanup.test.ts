import { expect, it, vi } from "vitest";
import { BackgroundRuntime, type BackgroundRuntimePort } from "./runtime";

class CleanupPort implements BackgroundRuntimePort {
  readonly subscriptions = new Set<() => void>();
  sceneReady: ((ready: boolean) => void) | undefined;
  failNextUnsubscribe: Error | undefined;
  closeFailure: Error | undefined;
  overlayFailure: Error | undefined;
  closed = 0;
  deleted = 0;

  private subscribe(callback: () => void): () => void {
    const unsubscribe = () => {
      this.subscriptions.delete(unsubscribe);
      if (this.failNextUnsubscribe) {
        const failure = this.failNextUnsubscribe;
        this.failNextUnsubscribe = undefined;
        throw failure;
      }
    };
    this.subscriptions.add(unsubscribe);
    void callback;
    return unsubscribe;
  }

  async isSceneReady() { return true; }
  onSceneReady(callback: (ready: boolean) => void) {
    this.sceneReady = callback;
    return this.subscribe(() => undefined);
  }
  async onSceneOpen() {}
  async onSceneClose() {
    this.closed += 1;
    if (this.closeFailure) throw this.closeFailure;
  }
  onCoordinatorChange(callback: (active: boolean) => void) { return this.subscribe(() => callback(false)); }
  onSceneItemsChange(callback: () => void) { return this.subscribe(callback); }
  onLocalItemsChange(callback: () => void) { return this.subscribe(callback); }
  onSceneMetadataChange(callback: () => void) { return this.subscribe(callback); }
  onGridChange(callback: () => void) { return this.subscribe(callback); }
  onPlayerChange(callback: () => void) { return this.subscribe(callback); }
  onPartyChange(callback: () => void) { return this.subscribe(callback); }
  onBroadcast(callback: () => void) { return this.subscribe(callback); }
  async deleteLocalOverlays() {
    this.deleted += 1;
    if (this.overlayFailure) throw this.overlayFailure;
  }
  async pauseMovingArmies() {}
  async movementTick() {}
  async visibilityTick() {}
  async turnTick() {}
}

it("continues scene shutdown when one scene unsubscribe fails", async () => {
  const port = new CleanupPort();
  const report = vi.fn();
  const runtime = new BackgroundRuntime(port, undefined, report);
  runtime.start();
  await runtime.whenIdle();

  const failure = new Error("unsubscribe failed");
  port.failNextUnsubscribe = failure;
  port.sceneReady?.(false);
  await runtime.whenIdle();

  expect(report).toHaveBeenCalledWith(failure, "scene-subscription-cleanup");
  expect(port.closed).toBe(1);
  expect(port.deleted).toBe(1);
  expect(port.subscriptions.size).toBe(2);

  await runtime.stop();
});

it("still deletes local overlays when scene-close cleanup fails", async () => {
  const port = new CleanupPort();
  const report = vi.fn();
  const runtime = new BackgroundRuntime(port, undefined, report);
  runtime.start();
  await runtime.whenIdle();

  const failure = new Error("scene close failed");
  port.closeFailure = failure;
  port.sceneReady?.(false);
  await runtime.whenIdle();

  expect(report).toHaveBeenCalledWith(failure, "scene-close");
  expect(port.closed).toBe(1);
  expect(port.deleted).toBe(1);

  port.closeFailure = undefined;
  await runtime.stop();
});

it("reports overlay cleanup failure without rejecting lifecycle shutdown", async () => {
  const port = new CleanupPort();
  const report = vi.fn();
  const runtime = new BackgroundRuntime(port, undefined, report);
  runtime.start();
  await runtime.whenIdle();

  const failure = new Error("overlay cleanup failed");
  port.overlayFailure = failure;
  port.sceneReady?.(false);
  await runtime.whenIdle();

  expect(report).toHaveBeenCalledWith(failure, "overlay-cleanup");
  expect(port.closed).toBe(1);
  expect(port.deleted).toBe(1);

  port.overlayFailure = undefined;
  await runtime.stop();
});
