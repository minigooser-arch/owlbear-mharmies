import type { KeyEvent, Metadata, Tool, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import {
  TRANSPORT_LANDING_ARMY_ID_KEY,
  TRANSPORT_LANDING_RETURN_TOOL_KEY,
  TRANSPORT_LANDING_SHIP_ID_KEY,
  TRANSPORT_LANDING_TOOL_ID,
  TRANSPORT_LANDING_TOOL_MODE_ID
} from "../shared/constants";
import type { GridCellCoord } from "../shared/types";

export interface TransportLandingToolPort {
  getGridDpi(): Promise<number>;
  commitLanding(shipId: string, armyId: string, targetCell: GridCellCoord): Promise<void>;
  restoreTool(toolId: string): Promise<void>;
  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

export interface TransportLandingToolApi {
  create(tool: Tool): Promise<void>;
  remove(id: string): Promise<void>;
  createMode(mode: ToolMode): Promise<void>;
  removeMode(id: string): Promise<void>;
  setMetadata(toolId: string, update: Partial<Metadata>): Promise<void>;
}

export interface TransportLandingToolRegistration {
  (): Promise<void>;
  cancelSession(): Promise<void>;
}

function metadataString(context: ToolContext, key: string): string | undefined {
  const value = context.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function registerTransportLandingTool(
  api: TransportLandingToolApi,
  port: TransportLandingToolPort,
  iconUrl: string
): Promise<TransportLandingToolRegistration> {
  let closed = false;
  let tail: Promise<void> = Promise.resolve();

  const clearSession = async (): Promise<void> => {
    await api.setMetadata(TRANSPORT_LANDING_TOOL_ID, {
      [TRANSPORT_LANDING_SHIP_ID_KEY]: null,
      [TRANSPORT_LANDING_ARMY_ID_KEY]: null,
      [TRANSPORT_LANDING_RETURN_TOOL_KEY]: null
    });
  };

  const safeNotify = async (message: string, variant: "INFO" | "WARNING" | "ERROR") => {
    try { await port.notify(message, variant); } catch { /* best effort */ }
  };

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const queued = tail.then(operation, operation);
    tail = queued.catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      await safeNotify(`Не удалось высадить армию: ${message}`, "WARNING");
    });
    return tail;
  };

  const click = (context: ToolContext, event: ToolEvent): false => {
    void enqueue(async () => {
      if (closed) return;
      const shipId = metadataString(context, TRANSPORT_LANDING_SHIP_ID_KEY);
      const armyId = metadataString(context, TRANSPORT_LANDING_ARMY_ID_KEY);
      const returnToolId = metadataString(context, TRANSPORT_LANDING_RETURN_TOOL_KEY);
      if (!shipId || !armyId) {
        await safeNotify("Не выбран транспорт для высадки.", "WARNING");
        return;
      }
      const grid = new StrategicGridAdapter({ dpi: await port.getGridDpi(), offset: { x: 0, y: 0 } });
      const targetCell = grid.sceneToCell(event.pointerPosition);
      await port.commitLanding(shipId, armyId, targetCell);
      await clearSession();
      if (returnToolId && returnToolId !== TRANSPORT_LANDING_TOOL_ID) {
        await port.restoreTool(returnToolId);
      }
    });
    return false;
  };

  const keyDown = (context: ToolContext, event: KeyEvent): void => {
    if (event.key !== "Escape" || event.repeat) return;
    void enqueue(async () => {
      const returnToolId = metadataString(context, TRANSPORT_LANDING_RETURN_TOOL_KEY);
      await clearSession();
      if (returnToolId && returnToolId !== TRANSPORT_LANDING_TOOL_ID) {
        await port.restoreTool(returnToolId);
      }
    });
  };

  const tool: Tool = {
    id: TRANSPORT_LANDING_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Высадка армии" }],
    defaultMetadata: {
      [TRANSPORT_LANDING_SHIP_ID_KEY]: null,
      [TRANSPORT_LANDING_ARMY_ID_KEY]: null,
      [TRANSPORT_LANDING_RETURN_TOOL_KEY]: null
    }
  };
  const mode: ToolMode = {
    id: TRANSPORT_LANDING_TOOL_MODE_ID,
    icons: [{
      icon: iconUrl,
      label: "Выбрать клетку высадки",
      filter: { activeTools: [TRANSPORT_LANDING_TOOL_ID] }
    }],
    cursors: [{ cursor: "crosshair" }],
    onToolClick: click,
    onKeyDown: keyDown
  };

  await api.create(tool);
  try {
    await api.createMode(mode);
  } catch (error) {
    await api.remove(TRANSPORT_LANDING_TOOL_ID);
    throw error;
  }

  const remove = (async () => {
    if (closed) return;
    closed = true;
    await tail;
    try { await clearSession(); } catch { /* best effort teardown */ }
    try {
      await api.removeMode(TRANSPORT_LANDING_TOOL_MODE_ID);
    } finally {
      await api.remove(TRANSPORT_LANDING_TOOL_ID);
    }
  }) as TransportLandingToolRegistration;
  remove.cancelSession = async () => {
    await tail;
    await clearSession();
  };
  return remove;
}
