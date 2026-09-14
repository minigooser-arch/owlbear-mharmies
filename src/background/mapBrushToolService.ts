import type { CommandAck } from "../commands/commandGateway";
import { StrategicGridAdapter, cellKey } from "../grid/strategicGrid";
import { reconcileLocalOverlays, type LocalOverlayBatchPort } from "../owlbear/localOverlayReconciler";
import type { MapBrushSettings, MapBrushToolPort } from "../owlbear/mapBrushTool";
import { METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type ArmyCommandPayload, type GridCellCoord, type SceneItemRecord } from "../shared/types";
import { MetadataRepository, type MetadataPort } from "../storage/metadataRepository";

export interface MapBrushIdentity {
  id: string;
  role: "GM" | "PLAYER";
  connectionId: string;
}

export interface MapBrushServicePort extends MetadataPort, LocalOverlayBatchPort {
  getPlayerIdentity(): Promise<MapBrushIdentity>;
  getGridDpi(): Promise<number>;
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

export interface MapBrushCommandGateway {
  send(command: ArmyCommand): Promise<CommandAck>;
}

export class MapBrushAuthorizationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MapBrushAuthorizationError";
  }
}

const MAX_REVISION_CONFLICT_RETRIES = 5;

function previewColor(settings: MapBrushSettings): string {
  if (settings.mode === "IMPASSABLE") return settings.impassable ? "#ef5350" : "#66bb6a";
  if (settings.mode === "RECOGNIZED_STATE") return "#26a69a";
  if (settings.mode === "DEFACTO_STATE") return "#ffb300";
  if (settings.mode === "ERASER") return "#bdbdbd";
  return "#42a5f5";
}

function previewKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.mapBrushPreview];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).cellKey;
  return typeof key === "string" ? key : undefined;
}

type MapBrushCommandPayload = Extract<
  ArmyCommandPayload,
  { type: "SET_TERRAIN_CELLS" | "SET_IMPASSABLE_CELLS" | "SET_RECOGNIZED_STATE_CELLS" | "SET_DEFACTO_STATE_CELLS" | "CLEAR_CELL_PROPERTIES" }
>;

function commandPayload(settings: MapBrushSettings, cells: GridCellCoord[]): MapBrushCommandPayload {
  if (settings.mode === "TERRAIN") {
    return { type: "SET_TERRAIN_CELLS", cells, terrainId: settings.terrainId };
  }
  if (settings.mode === "IMPASSABLE") {
    return { type: "SET_IMPASSABLE_CELLS", cells, impassable: settings.impassable };
  }
  if (settings.mode === "RECOGNIZED_STATE" || settings.mode === "DEFACTO_STATE") {
    if (!settings.stateId) throw new MapBrushAuthorizationError("STATE_NOT_FOUND");
    return settings.mode === "RECOGNIZED_STATE"
      ? { type: "SET_RECOGNIZED_STATE_CELLS", cells, stateId: settings.stateId }
      : { type: "SET_DEFACTO_STATE_CELLS", cells, stateId: settings.stateId };
  }
  return {
    type: "CLEAR_CELL_PROPERTIES",
    cells,
    target: settings.eraserTarget
  };
}

export class MapBrushToolService implements MapBrushToolPort {
  private readonly repository: MetadataRepository;

  constructor(
    private readonly port: MapBrushServicePort,
    private readonly gateway: MapBrushCommandGateway
  ) {
    this.repository = new MetadataRepository(port);
  }

  async getRole(): Promise<"GM" | "PLAYER"> {
    return (await this.port.getPlayerIdentity()).role;
  }

  getGridDpi(): Promise<number> {
    return this.port.getGridDpi();
  }

  async commitStroke(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void> {
    if (cells.length === 0) return;
    const [identity, scene] = await Promise.all([
      this.port.getPlayerIdentity(),
      this.repository.readScene()
    ]);
    if (identity.role !== "GM") throw new MapBrushAuthorizationError("GM_ONLY");
    const payload = commandPayload(settings, cells.map((cell) => ({ ...cell })));
    const buildCommand = (expectedRevision: number): ArmyCommand => ({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      senderPlayerId: identity.id,
      senderConnectionId: identity.connectionId,
      expectedRevision,
      ...payload
    } as ArmyCommand);

    let expectedRevision = scene.revision;
    for (let retry = 0; retry <= MAX_REVISION_CONFLICT_RETRIES; retry += 1) {
      const ack = await this.gateway.send(buildCommand(expectedRevision));
      if (ack.status === "ACCEPTED") return;
      if (ack.status === "REJECTED") {
        throw new MapBrushAuthorizationError(ack.reason ?? "INVALID_COMMAND");
      }
      if (
        !Number.isInteger(ack.actualRevision) ||
        (ack.actualRevision ?? -1) < 0 ||
        retry === MAX_REVISION_CONFLICT_RETRIES
      ) {
        throw new MapBrushAuthorizationError("REVISION_CONFLICT");
      }
      expectedRevision = ack.actualRevision as number;
    }
  }

  async renderPreview(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void> {
    const dpi = await this.port.getGridDpi();
    const grid = new StrategicGridAdapter({ dpi, offset: { x: 0, y: 0 } });
    const half = dpi / 2;
    const color = previewColor(settings);
    await reconcileLocalOverlays(
      this.port,
      previewKey,
      cells.map((cell) => {
        const center = grid.cellToSceneCenter(cell);
        const key = cellKey(cell);
        return {
          key,
          item: {
            type: "CURVE",
            position: { x: 0, y: 0 },
            visible: true,
            disableHit: true,
            points: [
              { x: center.x - half, y: center.y - half },
              { x: center.x + half, y: center.y - half },
              { x: center.x + half, y: center.y + half },
              { x: center.x - half, y: center.y + half },
              { x: center.x - half, y: center.y - half }
            ],
            strokeColor: color,
            metadata: {
              [METADATA_KEYS.mapBrushPreview]: { cellKey: key }
            }
          }
        };
      })
    );
  }

  async clearPreview(): Promise<void> {
    await reconcileLocalOverlays(this.port, previewKey, []);
  }

  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void> {
    return this.port.show(message, variant);
  }
}
