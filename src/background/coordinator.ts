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

  constructor(private readonly options: CoordinatorLeaseOptions) {}

  start(): void {
    if (this.intervalId !== undefined) return;
    void this.tick();
    this.intervalId = setInterval(() => void this.tick(), 1_000);
  }

  stop(): void {
    if (this.intervalId !== undefined) clearInterval(this.intervalId);
    this.intervalId = undefined;
    this.setCoordinator(false);
  }

  isCoordinator(): boolean {
    return this.coordinator;
  }

  async tick(): Promise<void> {
    const elected = electCoordinator(await this.options.participants());
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

  private setCoordinator(value: boolean): void {
    if (this.coordinator === value) return;
    this.coordinator = value;
    this.options.onTransition?.(value);
  }
}
