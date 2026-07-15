import type { ArmyCommand } from "../shared/types";
import { METADATA_KEYS } from "../shared/constants";
import { migrateSceneState } from "../storage/migrations";

export interface BroadcastEvent {
  connectionId: string;
  data: unknown;
}

export interface BroadcastPort {
  send(channel: string, data: unknown): Promise<void>;
  on(channel: string, listener: (event: BroadcastEvent) => void): () => void;
}

export type CoordinatorConnectionResolver = () => Promise<string | undefined>;

export interface CommandAck {
  requestId: string;
  status: "ACCEPTED" | "REJECTED" | "CONFLICT";
  coordinatorConnectionId: string;
  recipientConnectionId: string;
  reason?: string;
  actualRevision?: number;
}

interface PendingRequest {
  resolve(ack: CommandAck): void;
  reject(error: Error): void;
  timeoutId: ReturnType<typeof setTimeout>;
  senderConnectionId: string;
  trustedCoordinatorConnectionId: Promise<string | undefined>;
}

export class CommandTimeoutError extends Error {
  constructor(readonly requestId: string) {
    super("Command acknowledgement timed out");
    this.name = "CommandTimeoutError";
  }
}

export class DuplicateRequestError extends Error {
  constructor(readonly requestId: string) {
    super(`Duplicate in-flight request: ${requestId}`);
    this.name = "DuplicateRequestError";
  }
}

function isCommandAck(value: unknown): value is CommandAck {
  if (typeof value !== "object" || value === null) return false;
  const ack = value as Partial<CommandAck>;
  const baseValid = (
    typeof ack.requestId === "string" &&
    (ack.status === "ACCEPTED" || ack.status === "REJECTED" || ack.status === "CONFLICT") &&
    typeof ack.coordinatorConnectionId === "string" &&
    typeof ack.recipientConnectionId === "string"
  );
  if (!baseValid) return false;
  if (ack.status === "REJECTED") {
    return typeof ack.reason === "string" && ack.reason.length > 0;
  }
  if (ack.status === "CONFLICT") {
    return (
      typeof ack.actualRevision === "number" &&
      Number.isInteger(ack.actualRevision) &&
      ack.actualRevision >= 0
    );
  }
  return true;
}

async function coordinatorConnectionIdFromScene(
  port: BroadcastPort
): Promise<string | undefined> {
  const metadataPort = port as BroadcastPort & {
    getSceneMetadata?: () => Promise<Record<string, unknown>>;
  };
  if (!metadataPort.getSceneMetadata) return undefined;
  const metadata = await metadataPort.getSceneMetadata();
  const migrated = migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 2 });
  return migrated.ok ? migrated.value.coordinatorLease?.connectionId : undefined;
}

export class CommandGateway {
  static readonly COMMAND_CHANNEL = "com.letopis.army-control/command";
  static readonly ACK_CHANNEL = "com.letopis.army-control/ack";

  private unsubscribe: (() => void) | undefined;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly port: BroadcastPort,
    private readonly timeoutMs = 5_000,
    private readonly resolveCoordinatorConnectionId: CoordinatorConnectionResolver = () =>
      coordinatorConnectionIdFromScene(port)
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.port.on(CommandGateway.ACK_CHANNEL, (event) => {
      void this.acceptTrustedAcknowledgement(event);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Command gateway stopped"));
    }
    this.pending.clear();
  }

  send(command: ArmyCommand): Promise<CommandAck> {
    if (!this.unsubscribe) throw new Error("Command gateway is not started");
    if (this.pending.has(command.requestId)) throw new DuplicateRequestError(command.requestId);
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new CommandTimeoutError(command.requestId));
      }, this.timeoutMs);
      this.pending.set(command.requestId, {
        resolve,
        reject,
        timeoutId,
        senderConnectionId: command.senderConnectionId,
        trustedCoordinatorConnectionId: this.resolveCoordinatorConnectionId().catch(() => undefined)
      });
      void this.port.send(CommandGateway.COMMAND_CHANNEL, command).catch((error: unknown) => {
        clearTimeout(timeoutId);
        this.pending.delete(command.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async acceptTrustedAcknowledgement(event: BroadcastEvent): Promise<void> {
    if (!isCommandAck(event.data) || event.connectionId !== event.data.coordinatorConnectionId) return;
    const pending = this.pending.get(event.data.requestId);
    if (!pending || event.data.recipientConnectionId !== pending.senderConnectionId) return;
    let trustedCoordinatorConnectionId: string | undefined;
    try {
      trustedCoordinatorConnectionId = await pending.trustedCoordinatorConnectionId;
    } catch {
      return;
    }
    if (
      this.pending.get(event.data.requestId) !== pending ||
      event.connectionId !== trustedCoordinatorConnectionId
    ) return;
    clearTimeout(pending.timeoutId);
    this.pending.delete(event.data.requestId);
    pending.resolve(event.data);
  }
}
