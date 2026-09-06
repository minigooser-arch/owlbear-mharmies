import type { CommandAck } from "../commands/commandGateway";
import type { TransportLandingToolPort } from "../owlbear/transportLandingTool";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type GridCellCoord } from "../shared/types";
import { MetadataRepository, type MetadataPort } from "../storage/metadataRepository";

export interface TransportLandingIdentity {
  id: string;
  role: "GM" | "PLAYER";
  connectionId: string;
}

export interface TransportLandingToolServicePort extends MetadataPort {
  getPlayerIdentity(): Promise<TransportLandingIdentity>;
  getGridDpi(): Promise<number>;
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
  activateTool(toolId: string): Promise<void>;
}

export interface TransportLandingCommandGateway {
  send(command: ArmyCommand): Promise<CommandAck>;
}

export class TransportLandingCommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TransportLandingCommandError";
  }
}

export class TransportLandingToolService implements TransportLandingToolPort {
  private readonly repository: MetadataRepository;

  constructor(
    private readonly port: TransportLandingToolServicePort,
    private readonly gateway: TransportLandingCommandGateway
  ) {
    this.repository = new MetadataRepository(port);
  }

  getGridDpi(): Promise<number> {
    return this.port.getGridDpi();
  }

  async commitLanding(shipId: string, armyId: string, targetCell: GridCellCoord): Promise<void> {
    const [identity, scene] = await Promise.all([
      this.port.getPlayerIdentity(),
      this.repository.readScene()
    ]);
    const command: ArmyCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      senderPlayerId: identity.id,
      senderConnectionId: identity.connectionId,
      expectedRevision: scene.revision,
      type: "DISEMBARK_ARMY",
      shipId,
      armyId,
      targetCell: { ...targetCell }
    };
    const acknowledgement = await this.gateway.send(command);
    if (acknowledgement.status === "REJECTED") {
      throw new TransportLandingCommandError(acknowledgement.reason ?? "INVALID_COMMAND");
    }
    if (acknowledgement.status === "CONFLICT") {
      throw new TransportLandingCommandError("REVISION_CONFLICT");
    }
  }

  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void> {
    return this.port.show(message, variant);
  }

  restoreTool(toolId: string): Promise<void> {
    return this.port.activateTool(toolId);
  }
}
