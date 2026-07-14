import type { ArmyCommand } from "../shared/types";

export interface BroadcastEvent {
  connectionId: string;
  data: unknown;
}

export interface BroadcastPort {
  send(channel: string, data: unknown): Promise<void>;
  on(channel: string, listener: (event: BroadcastEvent) => void): () => void;
}

export interface CommandAck {
  requestId: string;
  status: "ACCEPTED" | "REJECTED" | "CONFLICT";
  coordinatorConnectionId: string;
  reason?: string;
  actualRevision?: number;
}

interface PendingRequest {
  resolve(ack: CommandAck): void;
  reject(error: Error): void;
  timeoutId: ReturnType<typeof setTimeout>;
}

function isCommandAck(value: unknown): value is CommandAck {
  if (typeof value !== "object" || value === null) return false;
  const ack = value as Partial<CommandAck>;
  return (
    typeof ack.requestId === "string" &&
    (ack.status === "ACCEPTED" || ack.status === "REJECTED" || ack.status === "CONFLICT") &&
    typeof ack.coordinatorConnectionId === "string"
  );
}

export class CommandGateway {
  static readonly COMMAND_CHANNEL = "com.letopis.army-control/command";
  static readonly ACK_CHANNEL = "com.letopis.army-control/ack";

  private unsubscribe: (() => void) | undefined;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly port: BroadcastPort,
    private readonly timeoutMs = 5_000
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.port.on(CommandGateway.ACK_CHANNEL, (event) => {
      if (!isCommandAck(event.data) || event.connectionId !== event.data.coordinatorConnectionId) return;
      const pending = this.pending.get(event.data.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      this.pending.delete(event.data.requestId);
      pending.resolve(event.data);
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
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new Error("Command acknowledgement timed out"));
      }, this.timeoutMs);
      this.pending.set(command.requestId, { resolve, reject, timeoutId });
      void this.port.send(CommandGateway.COMMAND_CHANNEL, command).catch((error: unknown) => {
        clearTimeout(timeoutId);
        this.pending.delete(command.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }
}
