import type { Tool, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import { rasterizeBrushStroke } from "../terrain/brushMath";
import {
  NAVAL_BATTLE_AREA_REQUEST_ID_KEY,
  NAVAL_BATTLE_AREA_SESSION_ID_KEY,
  NAVAL_BATTLE_AREA_TOOL_ID,
  NAVAL_BATTLE_AREA_TOOL_MODE_ID
} from "../shared/constants";
import type { GridCellCoord } from "../shared/types";

export interface NavalBattleAreaToolPort {
  getRole(): Promise<"GM" | "PLAYER">;
  getGridDpi(): Promise<number>;
  publishDraft(requestId: string, cells: readonly GridCellCoord[]): Promise<void>;
  renderPreview(cells: readonly GridCellCoord[]): Promise<void>;
  clearPreview(): Promise<void>;
  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

export interface NavalBattleAreaToolApi {
  create(tool: Tool): Promise<void>;
  remove(id: string): Promise<void>;
  createMode(mode: ToolMode): Promise<void>;
  removeMode(id: string): Promise<void>;
}

export interface NavalBattleAreaToolRegistration {
  (): Promise<void>;
  registered: boolean;
}

function metadataString(context: ToolContext, key: string): string | undefined {
  const value = context.metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function cellKey(cell: GridCellCoord): string {
  return `${cell.x},${cell.y}`;
}

function mergeCells(target: Map<string, GridCellCoord>, cells: readonly GridCellCoord[]): void {
  for (const cell of cells) target.set(cellKey(cell), { ...cell });
}

export async function registerNavalBattleAreaTool(
  api: NavalBattleAreaToolApi,
  port: NavalBattleAreaToolPort,
  iconUrl: string
): Promise<NavalBattleAreaToolRegistration> {
  if (await port.getRole() !== "GM") {
    const noop = (async () => undefined) as NavalBattleAreaToolRegistration;
    noop.registered = false;
    return noop;
  }

  let grid: StrategicGridAdapter | undefined;
  let activeSessionId: string | undefined;
  let activeRequestId: string | undefined;
  let selected = new Map<string, GridCellCoord>();
  let stroke = new Map<string, GridCellCoord>();
  let lastCenter: GridCellCoord | undefined;
  let closed = false;
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = tail.then(operation, operation);
    tail = next.catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await port.notify(`Не удалось выбрать область морского боя: ${message}`, "ERROR");
      } catch {
        // Notification delivery is best-effort and must not break the tool queue.
      }
    });
    return tail;
  };

  const ensureGrid = async (): Promise<StrategicGridAdapter> => {
    grid ??= new StrategicGridAdapter({
      dpi: await port.getGridDpi(),
      offset: { x: 0, y: 0 }
    });
    return grid;
  };

  const selectionCells = (): GridCellCoord[] => [...selected.values()].map((cell) => ({ ...cell }));

  const previewCells = (): GridCellCoord[] => {
    const combined = new Map<string, GridCellCoord>();
    mergeCells(combined, [...selected.values()]);
    mergeCells(combined, [...stroke.values()]);
    return [...combined.values()];
  };

  const syncSession = async (context: ToolContext): Promise<string | undefined> => {
    const requestId = metadataString(context, NAVAL_BATTLE_AREA_REQUEST_ID_KEY);
    const sessionId = metadataString(context, NAVAL_BATTLE_AREA_SESSION_ID_KEY);
    if (!requestId || !sessionId) {
      await port.notify("Не выбрана заявка на морской бой.", "WARNING");
      return undefined;
    }
    if (activeSessionId !== sessionId || activeRequestId !== requestId) {
      activeSessionId = sessionId;
      activeRequestId = requestId;
      selected = new Map();
      stroke = new Map();
      lastCenter = undefined;
      await port.clearPreview();
    }
    return requestId;
  };

  const publish = async (requestId: string) => {
    const cells = selectionCells();
    await port.publishDraft(requestId, cells);
    await port.renderPreview(cells);
  };

  const click = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed) return;
    const requestId = await syncSession(context);
    if (!requestId) return;
    const adapter = await ensureGrid();
    const cell = adapter.sceneToCell(event.pointerPosition);
    selected.set(cellKey(cell), cell);
    await publish(requestId);
  });

  const dragStart = (context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed) return;
    const requestId = await syncSession(context);
    if (!requestId) return;
    const adapter = await ensureGrid();
    lastCenter = adapter.sceneToCell(event.pointerPosition);
    stroke = new Map();
    mergeCells(stroke, [lastCenter]);
    await port.renderPreview(previewCells());
  });

  const dragMove = (_context: ToolContext, event: ToolEvent) => enqueue(async () => {
    if (closed || !lastCenter) return;
    const adapter = await ensureGrid();
    const nextCenter = adapter.sceneToCell(event.pointerPosition);
    mergeCells(stroke, rasterizeBrushStroke(lastCenter, nextCenter, 1));
    lastCenter = nextCenter;
    await port.renderPreview(previewCells());
  });

  const finishDrag = (context: ToolContext, event?: ToolEvent) => enqueue(async () => {
    if (closed || !lastCenter) return;
    const requestId = await syncSession(context);
    if (!requestId) return;
    if (event) {
      const adapter = await ensureGrid();
      const nextCenter = adapter.sceneToCell(event.pointerPosition);
      mergeCells(stroke, rasterizeBrushStroke(lastCenter, nextCenter, 1));
    }
    mergeCells(selected, [...stroke.values()]);
    stroke = new Map();
    lastCenter = undefined;
    await publish(requestId);
  });

  const cancelDrag = () => enqueue(async () => {
    stroke = new Map();
    lastCenter = undefined;
    const cells = selectionCells();
    if (cells.length > 0) await port.renderPreview(cells);
    else await port.clearPreview();
  });

  const filter = { roles: ["GM" as const] };
  const tool: Tool = {
    id: NAVAL_BATTLE_AREA_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Область морского боя", filter }],
    defaultMetadata: {
      [NAVAL_BATTLE_AREA_REQUEST_ID_KEY]: null,
      [NAVAL_BATTLE_AREA_SESSION_ID_KEY]: null
    }
  };
  const mode: ToolMode = {
    id: NAVAL_BATTLE_AREA_TOOL_MODE_ID,
    icons: [{
      icon: iconUrl,
      label: "Выбрать клетки боя",
      filter: { activeTools: [NAVAL_BATTLE_AREA_TOOL_ID], roles: ["GM"] }
    }],
    cursors: [{ cursor: "crosshair" }],
    onToolClick: (context, event) => {
      void click(context, event);
      return false;
    },
    onToolDragStart: (context, event) => { void dragStart(context, event); },
    onToolDragMove: (context, event) => { void dragMove(context, event); },
    onToolDragEnd: (context, event) => { void finishDrag(context, event); },
    onToolDragCancel: () => { void cancelDrag(); },
    onDeactivate: () => { void enqueue(() => port.clearPreview()); }
  };

  await api.create(tool);
  try {
    await api.createMode(mode);
  } catch (error) {
    await api.remove(NAVAL_BATTLE_AREA_TOOL_ID);
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
    try {
      await api.removeMode(NAVAL_BATTLE_AREA_TOOL_MODE_ID);
    } finally {
      await api.remove(NAVAL_BATTLE_AREA_TOOL_ID);
    }
  }) as NavalBattleAreaToolRegistration;
  remove.registered = true;
  return remove;
}
