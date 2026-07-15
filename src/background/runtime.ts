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
}

export interface RuntimeRates {
  movementHz: number;
  visibilityHz: number;
}

export class BackgroundRuntime {
  private readonly readySubscriptions = new SubscriptionManager();
  private readonly sceneSubscriptions = new SubscriptionManager();
  private movementTimer: ReturnType<typeof setInterval> | undefined;
  private visibilityTimer: ReturnType<typeof setInterval> | undefined;
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

  constructor(
    private readonly port: BackgroundRuntimePort,
    private readonly rates: RuntimeRates = { movementHz: 5, visibilityHz: 4 }
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

  async stop(): Promise<void> {
    if (!this.started) {
      await this.whenIdle();
      return;
    }
    this.started = false;
    this.readyGeneration += 1;
    this.readySubscriptions.clear();
    this.trackLifecycle(() => this.closeScene());
    await this.whenIdle();
  }

  requestMovementTick(): void {
    if (!this.sceneOpen) return;
    if (this.movementRunning) {
      this.movementPending = true;
      return;
    }
    this.movementRunning = true;
    this.movementWork = this.runMovementQueue().catch(() => undefined);
  }

  requestVisibilityTick(): void {
    if (!this.sceneOpen) return;
    if (this.visibilityRunning) {
      this.visibilityPending = true;
      return;
    }
    this.visibilityRunning = true;
    this.visibilityWork = this.runVisibilityQueue().catch(() => undefined);
  }

  async whenIdle(): Promise<void> {
    await this.lifecycleWork;
    await Promise.all([this.movementWork, this.visibilityWork]);
  }

  private async openScene(): Promise<void> {
    if (!this.started || this.sceneOpen) return;
    this.sceneOpen = true;
    try {
      this.sceneSubscriptions.add(this.port.onCoordinatorChange((active) => {
        const lost = this.coordinator && !active;
        this.coordinator = active;
        if (lost) this.trackLifecycle(() => this.port.pauseMovingArmies());
      }));
      this.sceneSubscriptions.add(
        this.port.onSceneItemsChange(() => this.requestVisibilityTick())
      );
      this.sceneSubscriptions.add(this.port.onLocalItemsChange(() => undefined));
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
      this.visibilityTimer = setInterval(
        () => this.requestVisibilityTick(),
        1_000 / this.rates.visibilityHz
      );
      await this.port.onSceneOpen();
      this.requestVisibilityTick();
    } catch (error) {
      this.stopSceneWork();
      throw error;
    }
  }

  private async closeScene(): Promise<void> {
    if (!this.sceneOpen) return;
    this.stopSceneWork();
    await this.port.onSceneClose();
    await Promise.all([this.movementWork, this.visibilityWork]);
    await this.port.deleteLocalOverlays();
  }

  private stopSceneWork(): void {
    this.sceneOpen = false;
    this.coordinator = false;
    this.movementPending = false;
    this.visibilityPending = false;
    this.sceneSubscriptions.clear();
    if (this.movementTimer !== undefined) clearInterval(this.movementTimer);
    if (this.visibilityTimer !== undefined) clearInterval(this.visibilityTimer);
    this.movementTimer = undefined;
    this.visibilityTimer = undefined;
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

  private trackLifecycle(work: () => Promise<void>): void {
    const queued = this.lifecycleWork.then(work, work);
    this.lifecycleWork = queued.catch(() => undefined);
  }
}
