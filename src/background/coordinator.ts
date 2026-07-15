export interface CoordinatorParticipant {
  connectionId: string;
  role: "GM" | "PLAYER";
}

export interface HeartbeatLease {
  connectionId: string;
  epoch: number;
  expiresAt: number;
}

export function electCoordinator(
  participants: readonly CoordinatorParticipant[]
): string | undefined {
  return participants
    .filter((participant) => participant.role === "GM")
    .map((participant) => participant.connectionId)
    .sort()[0];
}

export interface CoordinatorLeaseOptions {
  connectionId: string;
  now(): number;
  participants(): Promise<readonly CoordinatorParticipant[]>;
  writeHeartbeat(lease: HeartbeatLease): Promise<void>;
  onTransition?(isCoordinator: boolean): void;
}

export class CoordinatorLease {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private coordinator = false;
  private epoch = 0;
  private active = false;
  private generation = 0;
  private tickRunning = false;
  private tickPending = false;
  private pendingGeneration: number | undefined;
  private tickWork: Promise<void> = Promise.resolve();

  constructor(private readonly options: CoordinatorLeaseOptions) {}

  start(): void {
    if (this.intervalId !== undefined) return;
    this.active = true;
    const generation = ++this.generation;
    void this.requestTick(generation).catch(() => undefined);
    this.intervalId = setInterval(
      () => void this.requestTick(generation).catch(() => undefined),
      1_000
    );
  }

  async stop(): Promise<void> {
    if (this.intervalId !== undefined) clearInterval(this.intervalId);
    this.intervalId = undefined;
    this.active = false;
    this.generation += 1;
    this.tickPending = false;
    this.setCoordinator(false);
    await this.tickWork.catch(() => undefined);
  }

  isCoordinator(): boolean {
    return this.coordinator;
  }

  tick(): Promise<void> {
    return this.requestTick(undefined);
  }

  private requestTick(generation: number | undefined): Promise<void> {
    this.tickPending = true;
    this.pendingGeneration = generation;
    if (this.tickRunning) return this.tickWork;
    this.tickRunning = true;
    this.tickWork = this.runTickQueue();
    return this.tickWork;
  }

  private async runTickQueue(): Promise<void> {
    try {
      while (this.tickPending) {
        this.tickPending = false;
        await this.tickOnce(this.pendingGeneration);
      }
    } finally {
      this.tickRunning = false;
    }
  }

  private async tickOnce(generation: number | undefined): Promise<void> {
    if (!this.generationIsCurrent(generation)) return;
    const elected = electCoordinator(await this.options.participants());
    if (!this.generationIsCurrent(generation)) return;
    const isCoordinator = elected === this.options.connectionId;
    this.setCoordinator(isCoordinator);
    if (!isCoordinator) return;
    this.epoch += 1;
    await this.options.writeHeartbeat({
      connectionId: this.options.connectionId,
      epoch: this.epoch,
      expiresAt: this.options.now() + 3_000
    });
  }

  private generationIsCurrent(generation: number | undefined): boolean {
    return generation === undefined || (this.active && generation === this.generation);
  }

  private setCoordinator(value: boolean): void {
    if (this.coordinator === value) return;
    this.coordinator = value;
    this.options.onTransition?.(value);
  }
}
