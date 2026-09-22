import type { Metadata, Tool, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import { getBrushCells, rasterizeBrushStroke, type BrushSize } from "../terrain/brushMath";
import { PointerMoveCoalescer } from "./pointerMoveCoalescer";
import { notificationMessage } from "./notifications";
import {
  MAP_BRUSH_ERASER_TARGET_KEY,
  MAP_BRUSH_IMPASSABLE_VALUE_KEY,
  MAP_BRUSH_MODE_KEY,
  MAP_BRUSH_STATE_ID_KEY,
  MAP_BRUSH_SIZE_KEY,
  MAP_BRUSH_TERRAIN_ID_KEY,
  MAP_BRUSH_TOOL_ID,
  MAP_BRUSH_TOOL_MODE_ID
} from "../shared/constants";
import type { CellPropertyTarget, GridCellCoord } from "../shared/types";

export type MapBrushMode = "TERRAIN" | "IMPASSABLE" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ERASER";
export type MapBrushEraserTarget = Exclude<CellPropertyTarget, "SELECTED_FACTION">;

export interface MapBrushSettings {
  mode: MapBrushMode;
  size: BrushSize;
  terrainId: string;
  stateId?: string;
  impassable: boolean;
  eraserTarget: MapBrushEraserTarget;
}

export interface MapBrushToolPort {
  getRole(): Promise<"GM" | "PLAYER">;
  getGridDpi(): Promise<number>;
  commitStroke(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void>;
  renderPreview(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void>;
  appendPreview(settings: MapBrushSettings, cells: readonly GridCellCoord[]): Promise<void>;
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
  cancelSession(): Promise<void>;
}

function brushSize(value: unknown): BrushSize {
  return value === 3 || value === 5 ? value : 1;
}

function mode(value: unknown): MapBrushMode {
  return value === "IMPASSABLE" || value === "RECOGNIZED_STATE" || value === "DEFACTO_STATE" || value === "ERASER"
    ? value
    : "TERRAIN";
}

function eraserTarget(value: unknown): MapBrushEraserTarget {
  return value === "IMPASSABLE" || value === "RECOGNIZED_STATE" || value === "DEFACTO_STATE" || value === "ALL"
    ? value
    : "TERRAIN";
}

export function mapBrushSettingsFromMetadata(metadata: Metadata): MapBrushSettings {
  const rawTerrainId = metadata[MAP_BRUSH_TERRAIN_ID_KEY];
  const rawStateId = metadata[MAP_BRUSH_STATE_ID_KEY];
  return {
    mode: mode(metadata[MAP_BRUSH_MODE_KEY]),
    size: brushSize(metadata[MAP_BRUSH_SIZE_KEY]),
    terrainId: typeof rawTerrainId === "string" && rawTerrainId.length > 0 ? rawTerrainId : "plain",
    ...(typeof rawStateId === "string" && rawStateId.length > 0 ? { stateId: rawStateId } : {}),
    impassable: metadata[MAP_BRUSH_IMPASSABLE_VALUE_KEY] !== false,
    eraserTarget: eraserTarget(metadata[MAP_BRUSH_ERASER_TARGET_KEY])
  };
}

function mergeCells(
  target: Map<string, GridCellCoord>,
  cells: readonly GridCellCoord[]
): GridCellCoord[] {
  const additions: GridCellCoord[] = [];
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (target.has(key)) continue;
    const copy = { ...cell };
    target.set(key, copy);
    additions.push(copy);
  }
  return additions;
}

export async function registerMapBrushTool(
  api: MapBrushToolApi,
  port: MapBrushToolPort,
  iconUrl: string
): Promise<MapBrushToolRegistration> {
  let grid: StrategicGridAdapter | undefined;
  let activeSettings: MapBrushSettings | undefined;
  let lastCenter: GridCellCoord | undefined;
  let stroke = new Map<string, GridCellCoord>();
  let hoverSettings: MapBrushSettings | undefined;
  let closed = false;
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = tail.then(operation, operation);
    tail = next.catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code : undefined;
      try {
        await port.notify(code ? notificationMessage(code) : `Не удалось изменить разметку: ${message}`, "ERROR");
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

  const moveCoalescer = new PointerMoveCoalescer(1_000 / 30, (point) =>
    enqueue(async () => {
      if (closed) return;
      const adapter = await ensureGrid();
      if (activeSettings && lastCenter) {
        const nextCenter = adapter.sceneToCell(point);
        const additions = mergeCells(
          stroke,
          rasterizeBrushStroke(lastCenter, nextCenter, activeSettings.size)
        );
        lastCenter = nextCenter;
        if (additions.length > 0) await port.appendPreview(activeSettings, additions);
        return;
      }
      if (hoverSettings) {
        await previewCells(
          hoverSettings,
          getBrushCells(adapter.sceneToCell(point), hoverSettings.size)
        );
      }
    })
  );

  const hover = (context: ToolContext, event: ToolEvent) => {
    if (closed || lastCenter) return;
    hoverSettings = mapBrushSettingsFromMetadata(context.metadata);
    moveCoalescer.push(event.pointerPosition);
  };

  const click = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    moveCoalescer.clear();
    if (closed) return;
    const adapter = await ensureGrid();
    const settings = mapBrushSettingsFromMetadata(context.metadata);
    const cells = getBrushCells(adapter.sceneToCell(event.pointerPosition), settings.size);
    await port.commitStroke(settings, cells);
    await previewCells(settings, cells);
  });

  const dragStart = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed) return;
    moveCoalescer.clear();
    hoverSettings = undefined;
    const adapter = await ensureGrid();
    activeSettings = mapBrushSettingsFromMetadata(context.metadata);
    lastCenter = adapter.sceneToCell(event.pointerPosition);
    stroke = new Map();
    mergeCells(stroke, getBrushCells(lastCenter, activeSettings.size));
    await previewCells(activeSettings, [...stroke.values()]);
  });

  const dragMove = (_context: ToolContext, event: ToolEvent) => {
    if (closed || !activeSettings || !lastCenter) return;
    moveCoalescer.push(event.pointerPosition);
  };

  const finishDrag = (event?: ToolEvent) => {
    moveCoalescer.clear();
    return enqueue(async () => {
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
  };

  const cancelDrag = () => {
    moveCoalescer.clear();
    hoverSettings = undefined;
    return enqueue(async () => {
      activeSettings = undefined;
      lastCenter = undefined;
      stroke = new Map();
      await port.clearPreview();
    });
  };

  const tool: Tool = {
    id: MAP_BRUSH_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Разметка карты", filter: { roles: ["GM"] } }],
    defaultMode: MAP_BRUSH_TOOL_MODE_ID,
    defaultMetadata: {
      [MAP_BRUSH_MODE_KEY]: "TERRAIN",
      [MAP_BRUSH_TERRAIN_ID_KEY]: "plain",
      [MAP_BRUSH_STATE_ID_KEY]: null,
      [MAP_BRUSH_SIZE_KEY]: 1,
      [MAP_BRUSH_IMPASSABLE_VALUE_KEY]: true,
      [MAP_BRUSH_ERASER_TARGET_KEY]: "TERRAIN"
    }
  };
  const modeDef: ToolMode = {
    id: MAP_BRUSH_TOOL_MODE_ID,
    icons: [{ icon: iconUrl, label: "Красить клетки", filter: { activeTools: [MAP_BRUSH_TOOL_ID], roles: ["GM"] } }],
    cursors: [{ cursor: "crosshair" }],
    onActivate: () => {
      grid = undefined;
      moveCoalescer.clear();
      hoverSettings = undefined;
    },
    onToolMove: (context, event) => { hover(context, event); },
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
    moveCoalescer.stop();
    await tail;
    try {
      await port.clearPreview();
    } catch {
      // Preview cleanup is best-effort during tool teardown.
    }
    try { await api.removeMode(MAP_BRUSH_TOOL_MODE_ID); } finally { await api.remove(MAP_BRUSH_TOOL_ID); }
  }) as MapBrushToolRegistration;
  remove.registered = true;
  remove.cancelSession = async () => {
    if (closed) return;
    grid = undefined;
    await cancelDrag();
  };
  return remove;
}
