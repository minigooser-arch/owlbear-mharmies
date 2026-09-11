import type { KeyEvent, Metadata, Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import {
  PROGRAMMATIC_ONLY_TOOL_FILTER,
  SHIP_ROUTE_CANCEL_ACTION_ID,
  SHIP_ROUTE_CLEAR_ACTION_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_UNDO_ACTION_ID
} from "../shared/constants";
import type { GridCellCoord, ShipFacing, Vector2 } from "../shared/types";
import { notificationMessage } from "./notifications";
import { PointerMoveCoalescer } from "./pointerMoveCoalescer";
import {
  ShipRouteToolController,
  type ShipRouteMapButton,
  type ShipRouteToolActivation,
  type ShipRouteToolSnapshot
} from "./shipRouteTool";

export interface ShipRouteToolIntegrationPort {
  loadSession(shipId: string): Promise<ShipRouteToolActivation>;
  commitRoute(
    shipId: string,
    startCell: GridCellCoord,
    cells: readonly GridCellCoord[],
    finalFacing?: ShipFacing
  ): Promise<void>;
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
    case "INSUFFICIENT_MOVEMENT_POINTS": return "Не хватает очков перемещения с учётом необходимого поворота";
    case "SAME_FACING": return "Корабль уже смотрит в эту сторону";
    default: return "Эту клетку нельзя добавить в маршрут корабля";
  }
}

function isMapButtonHit(button: ShipRouteMapButton | undefined, point: Vector2): boolean {
  if (!button) return false;
  return Math.abs(point.x - button.position.x) <= button.halfWidth
    && Math.abs(point.y - button.position.y) <= button.halfHeight;
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

  const safeNotify = async (message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void> => {
    try { await port.notify(message, variant); } catch { /* best effort */ }
  };

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const queued = tail.then(operation, operation);
    tail = queued.catch((error: unknown) => safeNotify(`Не удалось изменить маршрут корабля: ${messageFrom(error)}`, "ERROR"));
    return tail;
  };

  const renderSnapshot = async (): Promise<void> => {
    const snapshot = controller.snapshot();
    if (!snapshot) return;
    await port.renderPreview(snapshot);
    previewRendered = true;
  };

  const moveCoalescer = new PointerMoveCoalescer(1_000 / 12, (point) =>
    enqueue(async () => {
      if (!active) return;
      const changed = await controller.move(point);
      if (changed) await renderSnapshot();
    })
  );

  const finishSession = async (restorePrevious: boolean): Promise<void> => {
    moveCoalescer.clear();
    const shouldClear = active || previewRendered;
    const previousToolId = returnToolId;
    controller.cancel();
    active = false;
    returnToolId = undefined;
    let failure: unknown;
    if (shouldClear) {
      try { await port.clearPreview(); previewRendered = false; } catch (error) { failure = error; }
    }
    try {
      await api.setMetadata(SHIP_ROUTE_TOOL_ID, {
        [SHIP_ROUTE_SHIP_ID_KEY]: null,
        [SHIP_ROUTE_RETURN_TOOL_KEY]: null
      });
    } catch (error) { failure ??= error; }
    if (restorePrevious && previousToolId && previousToolId !== SHIP_ROUTE_TOOL_ID) {
      try { await port.restoreTool(previousToolId); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  };

  const commitCurrentRoute = async (): Promise<boolean> => {
    if (!active) return false;
    const snapshot = controller.snapshot();
    if (!snapshot || (snapshot.cells.length === 0 && !snapshot.plannedFacing)) {
      await safeNotify("Добавьте хотя бы одну клетку маршрута или выберите поворот", "WARNING");
      return false;
    }
    try {
      await port.commitRoute(
        snapshot.shipId,
        snapshot.startCell,
        snapshot.cells,
        snapshot.plannedFacing
      );
    } catch (error) {
      await safeNotify(`Не удалось сохранить маршрут корабля: ${messageFrom(error)}`, "ERROR");
      return false;
    }
    await finishSession(true);
    return true;
  };

  const activate = (context: ToolContext): void => {
    if (closed) return;
    moveCoalescer.clear();
    const activation = ++generation;
    void enqueue(async () => {
      await finishSession(false);
      const shipId = context.metadata[SHIP_ROUTE_SHIP_ID_KEY];
      const previousToolId = context.metadata[SHIP_ROUTE_RETURN_TOOL_KEY];
      returnToolId = typeof previousToolId === "string" ? previousToolId : undefined;
      if (typeof shipId !== "string" || shipId.length === 0) {
        await safeNotify("Не выбран корабль для маршрута", "WARNING");
        if (returnToolId && returnToolId !== SHIP_ROUTE_TOOL_ID) {
          const toolId = returnToolId; returnToolId = undefined; await port.restoreTool(toolId);
        }
        return;
      }
      let session: ShipRouteToolActivation;
      try { session = await port.loadSession(shipId); }
      catch (error) {
        if (!closed && activation === generation) {
          await safeNotify(`Не удалось открыть маршрут корабля: ${messageFrom(error)}`, "ERROR");
          if (returnToolId && returnToolId !== SHIP_ROUTE_TOOL_ID) {
            const toolId = returnToolId; returnToolId = undefined; await port.restoreTool(toolId);
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
    moveCoalescer.clear();
    await enqueue(async () => {
      if (!active) return;
      const snapshot = controller.snapshot();
      if (!snapshot) return;

      if (isMapButtonHit(snapshot.finishButton, event.pointerPosition)) {
        await commitCurrentRoute();
        return;
      }
      if (isMapButtonHit(snapshot.turnButton, event.pointerPosition)) {
        controller.toggleTurnMenu();
        await renderSnapshot();
        return;
      }
      const turnChoice = snapshot.turnChoices?.find((choice) =>
        isMapButtonHit(choice, event.pointerPosition)
      );
      if (turnChoice) {
        if (!turnChoice.affordable) {
          await safeNotify(clickFailureMessage("INSUFFICIENT_MOVEMENT_POINTS"), "WARNING");
          return;
        }
        const turnResult = controller.selectFinalFacing(turnChoice.facing);
        if (!turnResult.accepted) {
          await safeNotify(clickFailureMessage(turnResult.reason), "WARNING");
          return;
        }
        await renderSnapshot();
        return;
      }
      if (snapshot.turnChoices) return;

      const result = await controller.click(event.pointerPosition);
      if (!result.accepted) {
        await renderSnapshot();
        await safeNotify(clickFailureMessage(result.reason), "WARNING");
        return;
      }
      const nextSnapshot = controller.snapshot();
      if (nextSnapshot && nextSnapshot.cells.length > 0 && nextSnapshot.remainingMovementPoints === 0) {
        await commitCurrentRoute();
        return;
      }
      await renderSnapshot();
    });
    return false;
  };

  const keyDown = (event: KeyEvent): void => {
    if (closed || (event.key === "Enter" && event.repeat)) return;
    moveCoalescer.clear();
    void enqueue(async () => {
      if (!active) return;
      const result = controller.key(event.key);
      if (result.action === "EDITING") await renderSnapshot();
      else if (result.action === "CANCEL") await finishSession(true);
    });
  };

  const deactivate = (): void => {
    if (closed) return;
    moveCoalescer.clear();
    generation += 1;
    void enqueue(() => finishSession(false));
  };

  const actionFilter = { activeTools: [SHIP_ROUTE_TOOL_ID] };
  const undoAction: ToolAction = {
    id: SHIP_ROUTE_UNDO_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Шаг назад", filter: actionFilter }],
    onClick: () => {
      moveCoalescer.clear();
      void enqueue(async () => { if (active) { controller.undo(); await renderSnapshot(); } });
    }
  };
  const clearAction: ToolAction = {
    id: SHIP_ROUTE_CLEAR_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Очистить маршрут", filter: actionFilter }],
    onClick: () => {
      moveCoalescer.clear();
      void enqueue(async () => { if (active) { controller.clear(); await renderSnapshot(); } });
    }
  };
  const cancelAction: ToolAction = {
    id: SHIP_ROUTE_CANCEL_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Отмена", filter: actionFilter }],
    onClick: () => {
      moveCoalescer.clear();
      void enqueue(() => finishSession(true));
    }
  };

  const tool: Tool = {
    id: SHIP_ROUTE_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Маршрут корабля", filter: PROGRAMMATIC_ONLY_TOOL_FILTER }],
    defaultMetadata: { [SHIP_ROUTE_SHIP_ID_KEY]: null, [SHIP_ROUTE_RETURN_TOOL_KEY]: null }
  };
  const mode: ToolMode = {
    id: SHIP_ROUTE_TOOL_MODE_ID,
    icons: [{ icon: iconUrl, label: "Проложить переход", filter: { activeTools: [SHIP_ROUTE_TOOL_ID] } }],
    cursors: [{ cursor: "crosshair" }],
    onActivate: activate,
    onDeactivate: deactivate,
    onToolMove: (_context, event) => moveCoalescer.push(event.pointerPosition),
    onToolClick: (_context, event) => click(event),
    onKeyDown: (_context, event) => keyDown(event)
  };

  await api.create(tool);
  const actions = [undoAction, clearAction, cancelAction];
  try {
    await api.createMode(mode);
    for (const action of actions) await api.createAction(action);
  } catch (error) {
    for (const action of actions) { try { await api.removeAction(action.id); } catch { /* best effort */ } }
    try { await api.removeMode(SHIP_ROUTE_TOOL_MODE_ID); } catch { /* best effort */ }
    await api.remove(SHIP_ROUTE_TOOL_ID);
    throw error;
  }

  const remove = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    generation += 1;
    moveCoalescer.stop();
    await tail;
    let failure: unknown;
    try { await finishSession(false); } catch (error) { failure = error; }
    for (const actionId of [SHIP_ROUTE_UNDO_ACTION_ID, SHIP_ROUTE_CLEAR_ACTION_ID, SHIP_ROUTE_CANCEL_ACTION_ID]) {
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
    moveCoalescer.clear();
    await enqueue(() => finishSession(false));
  };
  return registration;
}
