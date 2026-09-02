import type { Metadata, Tool, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import { getBrushCells, rasterizeBrushStroke, type BrushSize } from "../terrain/brushMath";
import {
  MAP_BRUSH_ERASER_TARGET_KEY,
  MAP_BRUSH_FACTION_OPERATION_KEY,
  MAP_BRUSH_IMPASSABLE_VALUE_KEY,
  MAP_BRUSH_MODE_KEY,
  MAP_BRUSH_SIDE_ID_KEY,
  MAP_BRUSH_STATE_ID_KEY,
  MAP_BRUSH_SIZE_KEY,
  MAP_BRUSH_TERRAIN_ID_KEY,
  MAP_BRUSH_TOOL_ID,
  MAP_BRUSH_TOOL_MODE_ID
} from "../shared/constants";
import type { CellPropertyTarget, GridCellCoord } from "../shared/types";

export type MapBrushMode = "TERRAIN" | "IMPASSABLE" | "FACTION_TERRITORY" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ERASER";

export interface MapBrushSettings {
  mode: MapBrushMode;
  size: BrushSize;
  terrainId: string;
  sideId?: string;
  stateId?: string;
  factionOperation: "ADD" | "REMOVE";
  impassable: boolean;
  eraserTarget: CellPropertyTarget;
}

export interface MapBrushToolPort {
  getRole(): Promise<"GM" | "PLAYER">;
  getGridDpi(): Promise<number>;
  commitStroke(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void>;
  renderPreview(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void>;
  clearPreview(): Promise<void>;
  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

export interface MapBrushToolApi {
  create(tool: Tool): Promise<void>;
  remove(id: string): Promise<void>;
  createMode(mode: ToolMode): Promise<void>;
  removeMode(id: string): Promise<void>;
  setMetadata(toolId: string, update: Partial<Metadata>): Promise<void>;
}

export interface MapBrushToolRegistration {
  (): Promise<void>;
  registered: boolean;
}

function brushSize(value: unknown): BrushSize {
  return value === 3 || value === 5 ? value : 1;
}

function mode(value: unknown): MapBrushMode {
  return value === "IMPASSABLE" || value === "FACTION_TERRITORY" || value === "RECOGNIZED_STATE" || value === "DEFACTO_STATE" || value === "ERASER"
    ? value
    : "TERRAIN";
}

function eraserTarget(value: unknown): CellPropertyTarget {
  return value === "IMPASSABLE" || value === "SELECTED_FACTION" || value === "RECOGNIZED_STATE" || value === "DEFACTO_STATE" || value === "ALL"
    ? value
    : "TERRAIN";
}

export function mapBrushSettingsFromMetadata(metadata: Metadata): MapBrushSettings {
  const rawSideId = metadata[MAP_BRUSH_SIDE_ID_KEY];
  const rawTerrainId = metadata[MAP_BRUSH_TERRAIN_ID_KEY];
  const rawStateId = metadata[MAP_BRUSH_STATE_ID_KEY];
  return {
    mode: mode(metadata[MAP_BRUSH_MODE_KEY]),
    size: brushSize(metadata[MAP_BRUSH_SIZE_KEY]),
    terrainId: typeof rawTerrainId === "string" && rawTerrainId.length > 0 ? rawTerrainId : "plain",
    ...(typeof rawSideId === "string" && rawSideId.length > 0 ? { sideId: rawSideId } : {}),
    ...(typeof rawStateId === "string" && rawStateId.length > 0 ? { stateId: rawStateId } : {}),
    factionOperation: metadata[MAP_BRUSH_FACTION_OPERATION_KEY] === "REMOVE" ? "REMOVE" : "ADD",
    impassable: metadata[MAP_BRUSH_IMPASSABLE_VALUE_KEY] !== false,
    eraserTarget: eraserTarget(metadata[MAP_BRUSH_ERASER_TARGET_KEY])
  };
}

function mergeCells(target: Map<string, GridCellCoord>, cells: readonly GridCellCoord[]): void {
  for (const cell of cells) target.set(`${cell.x},${cell.y}`, { ...cell });
}

export async function registerMapBrushTool(
  api: MapBrushToolApi,
  port: MapBrushToolPort,
  iconUrl: string
): Promise<MapBrushToolRegistration> {
  if (await port.getRole() !== "GM") {
    const noop = (async () => undefined) as MapBrushToolRegistration;
    noop.registered = false;
    return noop;
  }

  let grid: StrategicGridAdapter | undefined;
  let activeSettings: MapBrushSettings | undefined;
  let lastCenter: GridCellCoord | undefined;
  let stroke = new Map<string, GridCellCoord>();
  let closed = false;
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = tail.then(operation, operation);
    tail = next.catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await port.notify(`Не удалось изменить разметку: ${message}`, "ERROR");
      } catch {
        // Notification delivery is best-effort and must not break the tool queue.
      }
    });
    return tail;
  };

  const ensureGrid = async (): Promise<StrategicGridAdapter> => {
    grid ??= new StrategicGridAdapter({ dpi: await port.getGridDpi(), offset: { x: 0, y: 0 } });
    return grid;
  };

  const previewCells = async (settings: MapBrushSettings, cells: readonly GridCellCoord[]) => {
    await port.renderPreview(settings, cells);
  };

  const hover = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed || lastCenter) return;
    const adapter = await ensureGrid();
    const settings = mapBrushSettingsFromMetadata(context.metadata);
    await previewCells(settings, getBrushCells(adapter.sceneToCell(event.pointerPosition), settings.size));
  });

  const click = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed) return;
    const adapter = await ensureGrid();
    const settings = mapBrushSettingsFromMetadata(context.metadata);
    const cells = getBrushCells(adapter.sceneToCell(event.pointerPosition), settings.size);
    await port.commitStroke(settings, cells);
    await previewCells(settings, cells);
  });

  const dragStart = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed) return;
    const adapter = await ensureGrid();
    activeSettings = mapBrushSettingsFromMetadata(context.metadata);
    lastCenter = adapter.sceneToCell(event.pointerPosition);
    stroke = new Map();
    mergeCells(stroke, getBrushCells(lastCenter, activeSettings.size));
    await previewCells(activeSettings, [...stroke.values()]);
  });

  const dragMove = (_context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed || !activeSettings || !lastCenter) return;
    const adapter = await ensureGrid();
    const nextCenter = adapter.sceneToCell(event.pointerPosition);
    mergeCells(stroke, rasterizeBrushStroke(lastCenter, nextCenter, activeSettings.size));
    lastCenter = nextCenter;
    await previewCells(activeSettings, [...stroke.values()]);
  });

  const finishDrag = (event?: ToolEvent) => enqueue(async () => {
    if (closed || !activeSettings || !lastCenter) return;
    if (event) {
      const adapter = await ensureGrid();
      const nextCenter = adapter.sceneToCell(event.pointerPosition);
      mergeCells(stroke, rasterizeBrushStroke(lastCenter, nextCenter, activeSettings.size));
      lastCenter = nextCenter;
    }
    const settings = activeSettings;
    const cells = [...stroke.values()];
    activeSettings = undefined;
    lastCenter = undefined;
    stroke = new Map();
    if (cells.length > 0) await port.commitStroke(settings, cells);
    await port.clearPreview();
  });

  const cancelDrag = () => enqueue(async () => {
    activeSettings = undefined;
    lastCenter = undefined;
    stroke = new Map();
    await port.clearPreview();
  });

  const filter = { roles: ["GM" as const] };
  const tool: Tool = {
    id: MAP_BRUSH_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Разметка карты", filter }],
    defaultMetadata: {
      [MAP_BRUSH_MODE_KEY]: "TERRAIN",
      [MAP_BRUSH_TERRAIN_ID_KEY]: "plain",
      [MAP_BRUSH_STATE_ID_KEY]: null,
      [MAP_BRUSH_SIZE_KEY]: 1,
      [MAP_BRUSH_FACTION_OPERATION_KEY]: "ADD",
      [MAP_BRUSH_IMPASSABLE_VALUE_KEY]: true,
      [MAP_BRUSH_ERASER_TARGET_KEY]: "TERRAIN"
    }
  };
  const modeDef: ToolMode = {
    id: MAP_BRUSH_TOOL_MODE_ID,
    icons: [{ icon: iconUrl, label: "Красить клетки", filter: { activeTools: [MAP_BRUSH_TOOL_ID], roles: ["GM"] } }],
    cursors: [{ cursor: "crosshair" }],
    onToolMove: (context, event) => { void hover(context, event); },
    onToolClick: (context, event) => { void click(context, event); return false; },
    onToolDragStart: (context, event) => { void dragStart(context, event); },
    onToolDragMove: (context, event) => { void dragMove(context, event); },
    onToolDragEnd: (_context, event) => { void finishDrag(event); },
    onToolDragCancel: () => { void cancelDrag(); },
    onDeactivate: () => { void cancelDrag(); }
  };

  await api.create(tool);
  try {
    await api.createMode(modeDef);
  } catch (error) {
    await api.remove(MAP_BRUSH_TOOL_ID);
    throw error;
  }

  const remove = (async () => {
    if (closed) return;
    closed = true;
    await tail;
    try {
      await port.clearPreview();
    } catch {
      // Preview cleanup is best-effort during tool teardown.
    }
    try { await api.removeMode(MAP_BRUSH_TOOL_MODE_ID); } finally { await api.remove(MAP_BRUSH_TOOL_ID); }
  }) as MapBrushToolRegistration;
  remove.registered = true;
  return remove;
}
