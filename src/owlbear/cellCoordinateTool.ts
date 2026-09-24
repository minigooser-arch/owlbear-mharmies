import type { Tool, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import {
  METADATA_KEYS,
  CELL_COORDINATE_TOOL_ID,
  CELL_COORDINATE_TOOL_MODE_ID,
  CITY_CELL_PICK_CHANNEL,
  CITY_CELL_PICK_SESSION_KEY
} from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { PointerMoveCoalescer } from "./pointerMoveCoalescer";

export interface CellCoordinateToolApi {
  create(tool: Tool): Promise<void>;
  remove(id: string): Promise<void>;
  createMode(mode: ToolMode): Promise<void>;
  removeMode(id: string): Promise<void>;
}

export interface CellCoordinateToolPort {
  getGridDpi(): Promise<number>;
  createId(): string;
  getLocalItems(): Promise<SceneItemRecord[]>;
  addLocalItem(item: SceneItemRecord): Promise<void>;
  updateLocalItems(items: readonly SceneItemRecord[]): Promise<void>;
  deleteLocalItems(ids: readonly string[]): Promise<void>;
  send(channel: string, data: unknown): Promise<void>;
}

export interface CellCoordinateToolRegistration {
  (): Promise<void>;
  cancelSession(): Promise<void>;
}

const OVERLAY_KEY = METADATA_KEYS.coordinateOverlay;
type CoordinateOverlayKind = "HOVER" | "PINNED";

export async function registerCellCoordinateTool(
  api: CellCoordinateToolApi,
  port: CellCoordinateToolPort,
  iconUrl: string
): Promise<CellCoordinateToolRegistration> {
  let grid: StrategicGridAdapter | undefined;
  let hoverId: string | undefined;
  let pinnedId: string | undefined;
  let closed = false;
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = tail.then(operation, operation);
    tail = next.catch(() => undefined);
    return tail;
  };

  const ensureGrid = async (): Promise<StrategicGridAdapter> => {
    grid ??= new StrategicGridAdapter({ dpi: await port.getGridDpi(), offset: { x: 0, y: 0 } });
    return grid;
  };

  const renderLabel = async (
    kind: CoordinateOverlayKind,
    currentId: string | undefined,
    text: string,
    position: { x: number; y: number }
  ): Promise<string> => {
    const id = currentId ?? port.createId();
    const label: SceneItemRecord = {
      id,
      type: "LABEL",
      name: kind === "HOVER" ? "Координаты под курсором" : "Выбранная клетка",
      position,
      layer: "POINTER",
      visible: true,
      locked: true,
      disableHit: true,
      text,
      color: "#ffffff",
      fontSize: 14,
      padding: 5,
      backgroundOpacity: 0.9,
      cornerRadius: 4,
      metadata: { [OVERLAY_KEY]: { kind } }
    };
    if (currentId) await port.updateLocalItems([label]);
    else await port.addLocalItem(label);
    return id;
  };

  const drawHover = async (point: { x: number; y: number }): Promise<void> => {
    if (closed) return;
    const cell = (await ensureGrid()).sceneToCell(point);
    hoverId = await renderLabel("HOVER", hoverId, `X: ${cell.x}, Y: ${cell.y}`, { x: point.x + 18, y: point.y + 18 });
  };

  const moveCoalescer = new PointerMoveCoalescer(1_000 / 30, (point) => enqueue(() => drawHover(point)));

  const clearOverlays = async (): Promise<void> => {
    const staleIds = (await port.getLocalItems()).filter((item) => {
      const marker = item.metadata[OVERLAY_KEY];
      return typeof marker === "object" && marker !== null;
    }).map((item) => item.id);
    const ids = new Set(staleIds);
    if (hoverId) ids.add(hoverId);
    if (pinnedId) ids.add(pinnedId);
    hoverId = undefined;
    pinnedId = undefined;
    if (ids.size > 0) await port.deleteLocalItems([...ids]);
  };

  const move = (_context: ToolContext, event: ToolEvent): void => {
    if (!closed) moveCoalescer.push(event.pointerPosition);
  };

  const click = (context: ToolContext, event: ToolEvent): Promise<void> => enqueue(async () => {
    if (closed) return;
    moveCoalescer.clear();
    const cell = (await ensureGrid()).sceneToCell(event.pointerPosition);
    hoverId = await renderLabel("HOVER", hoverId, `X: ${cell.x}, Y: ${cell.y}`, {
      x: event.pointerPosition.x + 18,
      y: event.pointerPosition.y + 18
    });
    const center = (await ensureGrid()).cellToSceneCenter(cell);
    pinnedId = await renderLabel("PINNED", pinnedId, `Выбрано: ${cell.x}, ${cell.y}`, {
      x: center.x,
      y: center.y - (await port.getGridDpi()) * 0.35
    });
    const metadata = context.metadata as Record<string, unknown> | undefined;
    const sessionId = metadata?.[CITY_CELL_PICK_SESSION_KEY];
    if (typeof sessionId === "string" && sessionId.trim().length > 0) {
      await port.send(CITY_CELL_PICK_CHANNEL, { sessionId, x: cell.x, y: cell.y });
    }
  });

  const tool: Tool = {
    id: CELL_COORDINATE_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Координаты клеток" }],
    defaultMode: CELL_COORDINATE_TOOL_MODE_ID
  };
  const mode: ToolMode = {
    id: CELL_COORDINATE_TOOL_MODE_ID,
    icons: [{ icon: iconUrl, label: "Показать координаты", filter: { activeTools: [CELL_COORDINATE_TOOL_ID] } }],
    cursors: [{ cursor: "crosshair" }],
    onActivate: () => {
      closed = false;
      grid = undefined;
      moveCoalescer.clear();
      void enqueue(clearOverlays);
    },
    onToolMove: move,
    onToolClick: (context, event) => { void click(context, event); return false; },
    onDeactivate: () => {
      moveCoalescer.clear();
      void enqueue(clearOverlays);
    }
  };

  await api.create(tool);
  try {
    await api.createMode(mode);
  } catch (error) {
    await api.remove(CELL_COORDINATE_TOOL_ID);
    throw error;
  }

  const remove = (async () => {
    if (closed) return;
    closed = true;
    moveCoalescer.stop();
    await enqueue(clearOverlays);
    try { await api.removeMode(CELL_COORDINATE_TOOL_MODE_ID); } finally { await api.remove(CELL_COORDINATE_TOOL_ID); }
  }) as CellCoordinateToolRegistration;
  remove.cancelSession = async () => {
    moveCoalescer.clear();
    await enqueue(clearOverlays);
  };
  return remove;
}
