import type { KeyEvent, Metadata, Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import {
  SHIP_ROUTE_CANCEL_ACTION_ID,
  SHIP_ROUTE_CLEAR_ACTION_ID,
  SHIP_ROUTE_FINISH_ACTION_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_UNDO_ACTION_ID
} from "../shared/constants";
import type { GridCellCoord, Vector2 } from "../shared/types";
import { notificationMessage } from "./notifications";
import {
  ShipRouteToolController,
  type ShipRouteToolActivation,
  type ShipRouteToolSnapshot
} from "./shipRouteTool";

export interface ShipRouteToolIntegrationPort {
  loadSession(shipId: string): Promise<ShipRouteToolActivation>;
  commitRoute(shipId: string, startCell: GridCellCoord, cells: readonly GridCellCoord[]): Promise<void>;
  renderPreview(snapshot: ShipRouteToolSnapshot): Promise<void>;
  clearPreview(): Promise<void>;
  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
  restoreTool(toolId: string): Promise<void>;
}

export interface ShipRouteToolApi {
  create(tool: Tool): Promise<void>;
  remove(id: string): Promise<void>;
  createMode(mode: ToolMode): Promise<void>;
  removeMode(id: string): Promise<void>;
  createAction(action: ToolAction): Promise<void>;
  removeAction(id: string): Promise<void>;
  setMetadata(toolId: string, update: Partial<Metadata>): Promise<void>;
}

export interface ShipRouteToolRegistration {
  (): Promise<void>;
  cancelSession(): Promise<void>;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)) return error.message;
  return undefined;
}

function messageFrom(error: unknown): string {
  const code = errorCode(error);
  if (code) return notificationMessage(code);
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

function clickFailureMessage(reason: string): string {
  switch (reason) {
    case "NOT_ORTHOGONAL": return "Корабль может двигаться только по горизонтали или вертикали";
    case "IMPASSABLE": return "Эта клетка непроходима";
    case "NON_NAVAL_TERRAIN": return "Корабль может идти только по морю или каналу";
    case "INSUFFICIENT_MOVEMENT_POINTS": return "Не хватает очков перемещения";
    default: return "Эту клетку нельзя добавить в маршрут корабля";
  }
}

export async function registerShipRouteTool(
  api: ShipRouteToolApi,
  port: ShipRouteToolIntegrationPort,
  gridPort: { snapGridCenter(position: Vector2): Promise<Vector2> },
  iconUrl: string
): Promise<ShipRouteToolRegistration> {
  const controller = new ShipRouteToolController(gridPort);
  let tail: Promise<void> = Promise.resolve();
  let closed = false;
  let active = false;
  let previewRendered = false;
  let returnToolId: string | undefined;
  let generation = 0;

  const safeNotify = async (
    message: string,
    variant: "INFO" | "WARNING" | "ERROR"
  ): Promise<void> => {
    try {
      await port.notify(message, variant);
    } catch {
      // Notifications are best effort and must not break the tool queue.
    }
  };

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const queued = tail.then(operation, operation);
    tail = queued.catch((error: unknown) =>
      safeNotify(`Не удалось изменить маршрут корабля: ${messageFrom(error)}`, "ERROR")
    );
    return tail;
  };

  const renderSnapshot = async (): Promise<void> => {
    const snapshot = controller.snapshot();
    if (!snapshot) return;
    await port.renderPreview(snapshot);
    previewRendered = true;
  };

  const finishSession = async (restorePrevious: boolean): Promise<void> => {
    const shouldClear = active || previewRendered;
    const previousToolId = returnToolId;
    controller.cancel();
    active = false;
    returnToolId = undefined;
    let failure: unknown;

    if (shouldClear) {
      try {
        await port.clearPreview();
        previewRendered = false;
      } catch (error) {
        failure = error;
      }
    }

    try {
      await api.setMetadata(SHIP_ROUTE_TOOL_ID, {
        [SHIP_ROUTE_SHIP_ID_KEY]: null,
        [SHIP_ROUTE_RETURN_TOOL_KEY]: null
      });
    } catch (error) {
      failure ??= error;
    }

    if (restorePrevious && previousToolId && previousToolId !== SHIP_ROUTE_TOOL_ID) {
      try {
        await port.restoreTool(previousToolId);
      } catch (error) {
        failure ??= error;
      }
    }

    if (failure) throw failure;
  };

  const activate = (context: ToolContext): void => {
    if (closed) return;
    const activation = ++generation;
    void enqueue(async () => {
      await finishSession(false);
      const shipId = context.metadata[SHIP_ROUTE_SHIP_ID_KEY];
      const previousToolId = context.metadata[SHIP_ROUTE_RETURN_TOOL_KEY];
      returnToolId = typeof previousToolId === "string" ? previousToolId : undefined;

      if (typeof shipId !== "string" || shipId.length === 0) {
        await safeNotify("Не выбран корабль для маршрута", "WARNING");
        if (returnToolId && returnToolId !== SHIP_ROUTE_TOOL_ID) {
          const toolId = returnToolId;
          returnToolId = undefined;
          await port.restoreTool(toolId);
        }
        return;
      }

      let session: ShipRouteToolActivation;
      try {
        session = await port.loadSession(shipId);
      } catch (error) {
        if (!closed && activation === generation) {
          await safeNotify(`Не удалось открыть маршрут корабля: ${messageFrom(error)}`, "ERROR");
          if (returnToolId && returnToolId !== SHIP_ROUTE_TOOL_ID) {
            const toolId = returnToolId;
            returnToolId = undefined;
            await port.restoreTool(toolId);
          }
        }
        return;
      }

      if (closed || activation !== generation) return;
      controller.activate(session);
      active = true;
      await renderSnapshot();
    });
  };

  const click = async (event: ToolEvent): Promise<false> => {
    if (closed) return false;
    await enqueue(async () => {
      if (!active) return;
      const result = await controller.click(event.pointerPosition);
      await renderSnapshot();
      if (!result.accepted) await safeNotify(clickFailureMessage(result.reason), "WARNING");
    });
    return false;
  };

  const keyDown = (event: KeyEvent): void => {
    if (closed || (event.key === "Enter" && event.repeat)) return;
    void enqueue(async () => {
      if (!active) return;
      const result = controller.key(event.key);
      if (result.action === "EDITING") await renderSnapshot();
      else if (result.action === "CANCEL") await finishSession(true);
    });
  };

  const deactivate = (): void => {
    if (closed) return;
    generation += 1;
    void enqueue(() => finishSession(false));
  };

  const actionFilter = { activeTools: [SHIP_ROUTE_TOOL_ID] };
  const finishAction: ToolAction = {
    id: SHIP_ROUTE_FINISH_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Завершить маршрут", filter: actionFilter }],
    onClick: () => {
      void enqueue(async () => {
        if (!active) return;
        const result = controller.finish();
        if (result.action === "INVALID") {
          await safeNotify(
            result.reason === "EMPTY_ROUTE"
              ? "Добавьте хотя бы одну клетку маршрута"
              : clickFailureMessage(result.reason),
            "WARNING"
          );
          return;
        }
        if (result.action !== "COMMIT") return;
        try {
          await port.commitRoute(result.shipId, result.startCell, result.cells);
        } catch (error) {
          await safeNotify(`Не удалось сохранить маршрут корабля: ${messageFrom(error)}`, "ERROR");
          return;
        }
        await finishSession(true);
      });
    }
  };

  const undoAction: ToolAction = {
    id: SHIP_ROUTE_UNDO_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Шаг назад", filter: actionFilter }],
    onClick: () => {
      void enqueue(async () => {
        if (!active) return;
        controller.undo();
        await renderSnapshot();
      });
    }
  };

  const clearAction: ToolAction = {
    id: SHIP_ROUTE_CLEAR_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Очистить маршрут", filter: actionFilter }],
    onClick: () => {
      void enqueue(async () => {
        if (!active) return;
        controller.clear();
        await renderSnapshot();
      });
    }
  };

  const cancelAction: ToolAction = {
    id: SHIP_ROUTE_CANCEL_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Отмена", filter: actionFilter }],
    onClick: () => { void enqueue(() => finishSession(true)); }
  };

  const tool: Tool = {
    id: SHIP_ROUTE_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Маршрут корабля" }],
    defaultMetadata: {
      [SHIP_ROUTE_SHIP_ID_KEY]: null,
      [SHIP_ROUTE_RETURN_TOOL_KEY]: null
    }
  };

  const mode: ToolMode = {
    id: SHIP_ROUTE_TOOL_MODE_ID,
    icons: [{
      icon: iconUrl,
      label: "Проложить переход",
      filter: { activeTools: [SHIP_ROUTE_TOOL_ID] }
    }],
    cursors: [{ cursor: "crosshair" }],
    onActivate: activate,
    onDeactivate: deactivate,
    onToolMove: (_context, event) => {
      void enqueue(async () => {
        if (!active) return;
        await controller.move(event.pointerPosition);
        await renderSnapshot();
      });
    },
    onToolClick: (_context, event) => click(event),
    onKeyDown: (_context, event) => keyDown(event)
  };

  await api.create(tool);
  const actions = [finishAction, undoAction, clearAction, cancelAction];
  try {
    await api.createMode(mode);
    for (const action of actions) await api.createAction(action);
  } catch (error) {
    for (const action of actions) {
      try { await api.removeAction(action.id); } catch { /* best effort rollback */ }
    }
    try { await api.removeMode(SHIP_ROUTE_TOOL_MODE_ID); } catch { /* best effort rollback */ }
    await api.remove(SHIP_ROUTE_TOOL_ID);
    throw error;
  }

  const remove = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    generation += 1;
    await tail;
    let failure: unknown;
    try { await finishSession(false); } catch (error) { failure = error; }
    for (const actionId of [
      SHIP_ROUTE_FINISH_ACTION_ID,
      SHIP_ROUTE_UNDO_ACTION_ID,
      SHIP_ROUTE_CLEAR_ACTION_ID,
      SHIP_ROUTE_CANCEL_ACTION_ID
    ]) {
      try { await api.removeAction(actionId); } catch (error) { failure ??= error; }
    }
    try { await api.removeMode(SHIP_ROUTE_TOOL_MODE_ID); } catch (error) { failure ??= error; }
    try { await api.remove(SHIP_ROUTE_TOOL_ID); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  };

  const registration = remove as ShipRouteToolRegistration;
  registration.cancelSession = async (): Promise<void> => {
    if (closed) return;
    generation += 1;
    await enqueue(() => finishSession(false));
  };
  return registration;
}
