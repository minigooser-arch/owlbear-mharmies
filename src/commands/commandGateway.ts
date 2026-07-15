import { METADATA_KEYS } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand
} from "../shared/types";
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
  protocolVersion: typeof COMMAND_PROTOCOL_VERSION;
  requestId: string;
  status: "ACCEPTED" | "REJECTED" | "CONFLICT";
  coordinatorConnectionId: string;
  recipientConnectionId: string;
  reason?: string;
  actualRevision?: number;
}

export type AckRejectionReason =
  | "MALFORMED"
  | "WRONG_RECIPIENT"
  | "WRONG_SENDER"
  | "PROTOCOL_MISMATCH"
  | "STALE_REQUEST";

export type AckRejectionReporter = (
  reason: AckRejectionReason,
  event: BroadcastEvent
) => void;

interface PendingRequest {
  resolve(ack: CommandAck): void;
  reject(error: Error): void;
  timeoutId?: ReturnType<typeof setTimeout>;
  senderConnectionId: string;
  trustedCoordinatorConnectionId: Promise<string | undefined>;
}

export class CommandTimeoutError extends Error {
  constructor(readonly requestId: string) {
    super("COMMAND_TIMEOUT");
    this.name = "CommandTimeoutError";
  }
}

export class NoCoordinatorError extends Error {
  constructor(readonly requestId: string) {
    super("NO_COORDINATOR");
    this.name = "NoCoordinatorError";
  }
}

export class DuplicateRequestError extends Error {
  constructor(readonly requestId: string) {
    super(`Duplicate in-flight request: ${requestId}`);
    this.name = "DuplicateRequestError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function validStatusFields(ack: Record<string, unknown>): boolean {
  if (ack.status === "ACCEPTED") return true;
  if (ack.status === "REJECTED") {
    return typeof ack.reason === "string" && ack.reason.length > 0;
  }
  if (ack.status === "CONFLICT") {
    return typeof ack.actualRevision === "number" &&
      Number.isInteger(ack.actualRevision) &&
      ack.actualRevision >= 0;
  }
  return false;
}

async function coordinatorConnectionIdFromScene(
  port: BroadcastPort
): Promise<string | undefined> {
  const metadataPort = port as BroadcastPort & {
    getSceneMetadata?: () => Promise<Record<string, unknown>>;
  };
  if (!metadataPort.getSceneMetadata) return undefined;
  const metadata = await metadataPort.getSceneMetadata();
  const migrated = migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 3 });
  if (!migrated.ok) return undefined;
  const lease = migrated.value.coordinatorLease;
  return lease && lease.expiresAt > Date.now() ? lease.connectionId : undefined;
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
      coordinatorConnectionIdFromScene(port),
    private readonly reportRejection: AckRejectionReporter = () => undefined
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
      if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
      pending.reject(new Error("Command gateway stopped"));
    }
    this.pending.clear();
  }

  send(command: ArmyCommand): Promise<CommandAck> {
    if (!this.unsubscribe) throw new Error("Command gateway is not started");
    if (this.pending.has(command.requestId)) throw new DuplicateRequestError(command.requestId);

    const work = new Promise<CommandAck>((resolve, reject) => {
      this.pending.set(command.requestId, {
        resolve,
        reject,
        senderConnectionId: command.senderConnectionId,
        trustedCoordinatorConnectionId: this.resolveCoordinatorConnectionId().catch(() => undefined)
      });
    });
    const pending = this.pending.get(command.requestId);
    if (!pending) throw new Error("Failed to register pending command");
    void this.broadcastWhenCoordinatorIsKnown(command, pending);
    return work;
  }

  private async broadcastWhenCoordinatorIsKnown(
    command: ArmyCommand,
    pending: PendingRequest
  ): Promise<void> {
    try {
      const coordinatorConnectionId = await pending.trustedCoordinatorConnectionId;
      if (this.pending.get(command.requestId) !== pending) return;
      if (!coordinatorConnectionId) {
        this.rejectPending(command.requestId, pending, new NoCoordinatorError(command.requestId));
        return;
      }
      pending.timeoutId = setTimeout(() => {
        if (this.pending.get(command.requestId) !== pending) return;
        this.rejectPending(command.requestId, pending, new CommandTimeoutError(command.requestId));
      }, this.timeoutMs);
      await this.port.send(CommandGateway.COMMAND_CHANNEL, command);
    } catch (error) {
      if (this.pending.get(command.requestId) !== pending) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      this.rejectPending(command.requestId, pending, failure);
    }
  }

  private async acceptTrustedAcknowledgement(event: BroadcastEvent): Promise<void> {
    const raw = record(event.data);
    if (!raw || typeof raw.requestId !== "string") {
      this.report("MALFORMED", event);
      return;
    }
    const pending = this.pending.get(raw.requestId);
    if (!pending) {
      this.report("STALE_REQUEST", event);
      return;
    }
    const legacy = raw.protocolVersion === undefined;
    if (!legacy && raw.protocolVersion !== COMMAND_PROTOCOL_VERSION) {
      this.report("PROTOCOL_MISMATCH", event);
      return;
    }
    const trustedCoordinatorConnectionId = await pending.trustedCoordinatorConnectionId;
    if (this.pending.get(raw.requestId) !== pending) return;
    if (
      event.connectionId !== trustedCoordinatorConnectionId ||
      raw.coordinatorConnectionId !== event.connectionId
    ) {
      this.report("WRONG_SENDER", event);
      return;
    }
    if (!legacy && typeof raw.recipientConnectionId !== "string") {
      this.report("MALFORMED", event);
      return;
    }
    if (
      raw.recipientConnectionId !== undefined &&
      raw.recipientConnectionId !== pending.senderConnectionId
    ) {
      this.report("WRONG_RECIPIENT", event);
      return;
    }
    if (!validStatusFields(raw)) {
      this.report("MALFORMED", event);
      return;
    }

    const ack: CommandAck = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: raw.requestId,
      status: raw.status as CommandAck["status"],
      coordinatorConnectionId: event.connectionId,
      recipientConnectionId: pending.senderConnectionId,
      ...(raw.status === "REJECTED" ? { reason: raw.reason as string } : {}),
      ...(raw.status === "CONFLICT" ? { actualRevision: raw.actualRevision as number } : {})
    };
    if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
    this.pending.delete(raw.requestId);
    pending.resolve(ack);
  }

  private rejectPending(requestId: string, pending: PendingRequest, error: Error): void {
    if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private report(reason: AckRejectionReason, event: BroadcastEvent): void {
    try {
      this.reportRejection(reason, event);
    } catch {
      // Diagnostics must never break command delivery.
    }
  }
}
