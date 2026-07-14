import { SubscriptionManager } from "./subscriptions";

export interface BackgroundRuntimePort {
  onSceneReady(callback: (ready: boolean) => void): () => void;
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
  private readonly subscriptions = new SubscriptionManager();
  private movementTimer: ReturnType<typeof setInterval> | undefined;
  private visibilityTimer: ReturnType<typeof setInterval> | undefined;
  private coordinator = false;
  private started = false;
  private lifecycleWork: Promise<void> = Promise.resolve();
  private movementWork: Promise<void> = Promise.resolve();
  private movementRunning = false;
  private movementPending = false;

  constructor(
    private readonly port: BackgroundRuntimePort,
    private readonly rates: RuntimeRates = { movementHz: 5, visibilityHz: 4 }
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.subscriptions.add(this.port.onSceneReady((ready) => {
      if (!ready) this.trackLifecycle(this.closeScene());
    }));
    this.subscriptions.add(this.port.onCoordinatorChange((active) => {
      const lost = this.coordinator && !active;
      this.coordinator = active;
      if (lost) this.trackLifecycle(this.port.pauseMovingArmies());
    }));
    this.subscriptions.add(this.port.onSceneItemsChange(() => this.requestVisibilityTick()));
    this.subscriptions.add(this.port.onLocalItemsChange(() => undefined));
    this.subscriptions.add(this.port.onSceneMetadataChange(() => this.requestVisibilityTick()));
    this.subscriptions.add(this.port.onGridChange(() => this.requestVisibilityTick()));
    this.subscriptions.add(this.port.onPlayerChange(() => this.requestVisibilityTick()));
    this.subscriptions.add(this.port.onPartyChange(() => this.requestVisibilityTick()));
    this.subscriptions.add(this.port.onBroadcast(() => undefined));
    this.movementTimer = setInterval(
      () => this.requestMovementTick(),
      1_000 / this.rates.movementHz
    );
    this.visibilityTimer = setInterval(
      () => this.requestVisibilityTick(),
      1_000 / this.rates.visibilityHz
    );
  }

  stop(): void {
    this.started = false;
    this.subscriptions.clear();
    if (this.movementTimer !== undefined) clearInterval(this.movementTimer);
    if (this.visibilityTimer !== undefined) clearInterval(this.visibilityTimer);
    this.movementTimer = undefined;
    this.visibilityTimer = undefined;
  }

  requestMovementTick(): void {
    if (this.movementRunning) {
      this.movementPending = true;
      return;
    }
    this.movementRunning = true;
    this.movementWork = this.runMovementQueue();
  }

  requestVisibilityTick(): void {
    this.trackLifecycle(this.port.visibilityTick());
  }

  async whenIdle(): Promise<void> {
    await Promise.all([this.lifecycleWork, this.movementWork]);
  }

  private async runMovementQueue(): Promise<void> {
    try {
      do {
        this.movementPending = false;
        await this.port.movementTick();
      } while (this.movementPending);
    } finally {
      this.movementRunning = false;
    }
  }

  private trackLifecycle(work: Promise<void>): void {
    this.lifecycleWork = this.lifecycleWork.then(() => work);
  }

  private async closeScene(): Promise<void> {
    this.stop();
    await this.port.deleteLocalOverlays();
  }
}
