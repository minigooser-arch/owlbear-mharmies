import {
  CommandTimeoutError,
  NoCoordinatorError,
  type CommandAck
} from "../commands/commandGateway";
import { notifyRussian, type NotificationPort } from "../owlbear/notifications";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand } from "../shared/types";
import type { NavalInterceptionActionService } from "../owlbear/navalInterceptionContextMenu";

export interface NavalInterceptionContextMenuIdentity {
  id: string;
  role: "GM" | "PLAYER";
  connectionId: string;
}

export interface NavalInterceptionContextMenuServicePort extends NotificationPort {
  getPlayerIdentity(): Promise<NavalInterceptionContextMenuIdentity>;
  getSceneRevision(): Promise<number>;
}

export interface NavalInterceptionCommandGateway {
  send(command: ArmyCommand): Promise<CommandAck>;
}

export class NavalInterceptionContextMenuService implements NavalInterceptionActionService {
  constructor(
    private readonly port: NavalInterceptionContextMenuServicePort,
    private readonly gateway: NavalInterceptionCommandGateway
  ) {}

  async activateInterception(shipId: string): Promise<void> {
    try {
      const [identity, expectedRevision] = await Promise.all([
        this.port.getPlayerIdentity(),
        this.port.getSceneRevision()
      ]);
      const command: ArmyCommand = {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: crypto.randomUUID(),
        senderPlayerId: identity.id,
        senderConnectionId: identity.connectionId,
        expectedRevision,
        type: "NAVAL_ACTIVATE_INTERCEPTION",
        shipId
      };
      const acknowledgement = await this.gateway.send(command);
      if (acknowledgement.status === "REJECTED") {
        await notifyRussian(this.port, acknowledgement.reason ?? "INVALID_COMMAND");
        return;
      }
      if (acknowledgement.status === "CONFLICT") {
        await notifyRussian(this.port, "REVISION_CONFLICT");
      }
    } catch (error) {
      if (error instanceof NoCoordinatorError) {
        await notifyRussian(this.port, "NO_COORDINATOR");
        return;
      }
      if (error instanceof CommandTimeoutError) {
        await notifyRussian(this.port, "COMMAND_TIMEOUT");
        return;
      }
      await notifyRussian(this.port, "INVALID_COMMAND");
    }
  }
}
