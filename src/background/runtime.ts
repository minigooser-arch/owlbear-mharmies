Warning: truncated output (original token count: 2003)
Total output lines: 243

import { SubscriptionManager } from "./subscriptions";

export interface BackgroundRuntimePort {
  isSceneReady(): Promise<boolean>;
  onSceneReady(callback: (ready: boolean) => void): () => void;
  onSceneOpen(): void | Promise<void>;
  onSceneClose(): void | Promise<void>;
  onCoordinatorChange(callback: (active: boolean) => void): () => void;
  onSceneItemsChange(callback: () => void): () => void;
  onLocalItemsChange(callback: () => void): () => void;
  onSceneMetadataChange(callback: () => void): () => void;
  onGridChange(callback: () => void): () => void;
  onPlayerChange(callback: () => void): () => void;
  onPartyChange(callback: () => void): () => void;
  onBroadcast(callback: () => void): () => void;
  deleteLocalOverlays(): Promise<void>;
  pauseMovingArmies(): Promise<void>;
  movementTick(): Promise<void>;
  visibilityTick(): Promise<void>;
  turnTick(): Promise<void>;
}

export interface RuntimeRates {
  movementHz: number;
}

export type RuntimeErrorReporter = (error: unknown, context: string) => void;

function defaultRuntimeErrorReporter(error: unknown, context: string): void {
  console.error(`Letopis Armies background runtime failed: ${context}`, error);
}

export class BackgroundRuntime {
  private readonly readySubscriptions = new SubscriptionManager();
  private readonly sceneSubscriptions = new SubscriptionManager();
  private movementTimer: ReturnType<typeof setInterval> | undefined;
  private turnTimer: ReturnType<typeof setInterval> | undefined;
  private coordinator = false;
  private started = false;
  private sceneOpen = false;
  private readyGeneration = 0;
  private lifecycleWork: Promise<void> = Promise.resolve();
  private movementWork: Promise<void> = Promise.resolve();
  private movementRunning = false;
  private movementPending = false;
  private visibilityWork: Promise<void> = Promise.resolve();
  private visibilityRunning = false;
  private visibilityPending = false;
  private turnWork: Promise<void> = Promise.resolve();
  private turnRunning = false;
  private turnPending = false;

  constructor(
    private readonly port: BackgroundRuntimePort,
    private readonly rates: RuntimeRates = { movementHz: 5 },
    private readonly reportError: RuntimeErrorReporter = defaultRuntimeErrorReporter
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.readySubscriptions.add(this.port.onBroadcast(() => undefined));
    this.readySubscriptions.add(this.port.onSceneReady((ready) => {
      this.readyGeneration += 1;
      this.trackLifecycle(async () => {
        if (!this.started) return;
        if (ready) await this.openScene();
        else await this.closeScene();
      });
    }));
    const generation = this.readyGeneration;
    this.trackLifecycle(async () => {
      const ready = await this.port.isSceneReady();
      if (!this.started || generation !== this.readyGeneration) return;
      if (ready) await this.openScene();
      else await this.closeScene();
    });
  }

  as…503 tokens truncated…ort.onLocalItemsChange(() => undefined));
      this.sceneSubscriptions.add(
        this.port.onSceneMetadataChange(() => this.requestVisibilityTick())
      );
      this.sceneSubscriptions.add(this.port.onGridChange(() => this.requestVisibilityTick()));
      this.sceneSubscriptions.add(this.port.onPlayerChange(() => this.requestVisibilityTick()));
      this.sceneSubscriptions.add(this.port.onPartyChange(() => this.requestVisibilityTick()));
      this.movementTimer = setInterval(
        () => this.requestMovementTick(),
        1_000 / this.rates.movementHz
      );
      this.turnTimer = setInterval(() => this.requestTurnTick(), 30_000);
      await this.port.onSceneOpen();
      this.requestVisibilityTick();
      this.requestTurnTick();
    } catch (error) {
      this.stopSceneWork();
      throw error;
    }
  }

  private async closeScene(): Promise<void> {
    if (!this.sceneOpen) return;
    this.stopSceneWork();
    try {
      await this.port.onSceneClose();
    } catch (error) {
      this.reportError(error, "scene-close");
    }
    await Promise.all([this.movementWork, this.visibilityWork, this.turnWork]);
    try {
      await this.port.deleteLocalOverlays();
    } catch (error) {
      this.reportError(error, "overlay-cleanup");
    }
  }

  private stopSceneWork(): void {
    this.sceneOpen = false;
    this.coordinator = false;
    this.movementPending = false;
    this.visibilityPending = false;
    this.turnPending = false;
    this.clearSubscriptions(this.sceneSubscriptions, "scene-subscription-cleanup");
    if (this.movementTimer !== undefined) clearInterval(this.movementTimer);
    if (this.turnTimer !== undefined) clearInterval(this.turnTimer);
    this.movementTimer = undefined;
    this.turnTimer = undefined;
  }

  private clearSubscriptions(manager: SubscriptionManager, context: string): void {
    try {
      manager.clear();
    } catch (error) {
      this.reportError(error, context);
    }
  }

  private async runMovementQueue(): Promise<void> {
    try {
      do {
        this.movementPending = false;
        await this.port.movementTick();
      } while (this.movementPending && this.sceneOpen);
    } finally {
      this.movementRunning = false;
    }
  }

  private async runVisibilityQueue(): Promise<void> {
    try {
      do {
        this.visibilityPending = false;
        await this.port.visibilityTick();
      } while (this.visibilityPending && this.sceneOpen);
    } finally {
      this.visibilityRunning = false;
    }
  }

  private async runTurnQueue(): Promise<void> {
    try {
      do {
        this.turnPending = false;
        await this.port.turnTick();
      } while (this.turnPending && this.sceneOpen);
    } finally {
      this.turnRunning = false;
    }
  }

  private trackLifecycle(work: () => Promise<void>): void {
    const queued = this.lifecycleWork.then(work, work);
    this.lifecycleWork = queued.catch((error: unknown) => {
      this.reportError(error, "lifecycle");
    });
  }
}
