import type { KeyEvent, Metadata, Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import type { BarrierSegment } from "../barriers/barrierGeometry";
import type { GridRoutePort } from "../routes/routeMath";
import {
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID,
  ROUTE_FINISH_ACTION_ID,
  ROUTE_UNDO_ACTION_ID,
  ROUTE_CLEAR_ACTION_ID,
  ROUTE_CANCEL_ACTION_ID
} from "../shared/constants";
import type { GridCellCoord, GridMapState, TerrainRegistryState, Vector2, WarState } from "../shared/types";
import { notificationMessage } from "./notifications";
import { RouteToolController, type RouteToolSnapshot } from "./routeTool";

export interface RouteToolSession {
  armyId: string;
  start: Vector2;
  startCell: GridCellCoord;
  gridDpi: number;
  sideId: string;
  movementUnits: number;
  maxUnits: number;
  terrain: TerrainRegistryState;
  gridMap: GridMapState;
  wars: readonly WarState[];
  barriers: readonly BarrierSegment[];
}

export interface RouteToolIntegrationPort {
  loadSession(armyId: string): Promise<RouteToolSession>;
  commitRoute(armyId: string, route: readonly Vector2[], startCell: GridCellCoord, cells: readonly GridCellCoord[]): Promise<void>;
  renderPreview(snapshot: RouteToolSnapshot): Promise<void>;
  clearPreview(): Promise<void>;
  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
  restoreTool(toolId: string): Promise<void>;
}

export interface RouteToolApi {
  create(tool: Tool): Promise<void>;
  remove(id: string): Promise<void>;
  createMode(mode: ToolMode): Promise<void>;
  removeMode(id: string): Promise<void>;
  createAction(action: ToolAction): Promise<void>;
  removeAction(id: string): Promise<void>;
  setMetadata(toolId: string, update: Partial<Metadata>): Promise<void>;
}

export interface RouteToolRegistration {
  (): Promise<void>;
  cancelSession(): Promise<void>;
}

function messageFrom(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (typeof code === "string") return notificationMessage(code);
  if (error instanceof Error) {
    return /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? notificationMessage(error.message)
      : error.message;
  }
  return "Неизвестная ошибка";
}

export async function registerRouteTool(
  api: RouteToolApi,
  port: RouteToolIntegrationPort,
  distancePort: GridRoutePort,
  iconUrl: string
): Promise<RouteToolRegistration> {
  const controller = new RouteToolController(distancePort);
  const moveIntervalMs = 1_000 / 12;
  let tail: Promise<void> = Promise.resolve();
  let closed = false;
  let active = false;
  let previewRendered = false;
  let returnToolId: string | undefined;
  let generation = 0;
  let lastMoveAt = 0;
  let pendingMove: Vector2 | undefined;
  let moveTimer: ReturnType<typeof setTimeout> | undefined;

  const safeNotify = async (
    message: string,
    variant: "INFO" | "WARNING" | "ERROR"
  ): Promise<void> => {
    try {
      await port.notify(message, variant);
    } catch {
      // A failed notification must never break the Owlbear callback queue.
    }
  };

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const queued = tail.then(operation, operation);
    tail = queued.catch((error: unknown) =>
      safeNotify(`Не удалось изменить маршрут: ${messageFrom(error)}`, "ERROR")
    );
    return tail;
  };

  const cancelMoveTimer = () => {
    if (moveTimer !== undefined) clearTimeout(moveTimer);
    moveTimer = undefined;
    pendingMove = undefined;
  };

  const renderSnapshot = async () => {
    const snapshot = controller.snapshot();
    if (!snapshot) return;
    await port.renderPreview(snapshot);
    previewRendered = true;
  };

  const finishSession = async (restorePrevious: boolean, cancelMoves = true) => {
    if (cancelMoves) cancelMoveTimer();
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
      await api.setMetadata(ROUTE_TOOL_ID, {
        [ROUTE_ARMY_ID_KEY]: null,
        [ROUTE_RETURN_TOOL_KEY]: null
      });
    } catch (error) {
      failure ??= error;
    }
    if (restorePrevious && previousToolId && previousToolId !== ROUTE_TOOL_ID) {
      try {
        await port.restoreTool(previousToolId);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
  };

  const runPendingMove = (): Promise<void> => {
    if (moveTimer !== undefined) clearTimeout(moveTimer);
    moveTimer = undefined;
    const point = pendingMove;
    pendingMove = undefined;
    if (!point) return Promise.resolve();
    lastMoveAt = Date.now();
    return enqueue(async () => {
      if (!active) return;
      await controller.move(point);
      await renderSnapshot();
    });
  };

  const scheduleMove = (point: Vector2) => {
    pendingMove = { ...point };
    if (moveTimer !== undefined) return;
    const delay = Math.max(0, moveIntervalMs - (Date.now() - lastMoveAt));
    if (delay === 0) {
      void runPendingMove();
      return;
    }
    moveTimer = setTimeout(() => {
      void runPendingMove();
    }, delay);
  };

  const activate = (context: ToolContext) => {
    if (closed) return;
    cancelMoveTimer();
    const activation = ++generation;
    void enqueue(async () => {
      await finishSession(false, false);
      const armyId = context.metadata[ROUTE_ARMY_ID_KEY];
      const previousToolId = context.metadata[ROUTE_RETURN_TOOL_KEY];
      returnToolId = typeof previousToolId === "string" ? previousToolId : undefined;
      if (typeof armyId !== "string" || armyId.length === 0) {
        await safeNotify("Не выбрана армия для маршрута", "WARNING");
        if (returnToolId && returnToolId !== ROUTE_TOOL_ID) {
          const toolId = returnToolId;
          returnToolId = undefined;
          await port.restoreTool(toolId);
        }
        return;
      }
      let session: RouteToolSession;
      try {
        session = await port.loadSession(armyId);
      } catch (error) {
        if (!closed && activation === generation) {
          await safeNotify(`Не удалось открыть маршрут: ${messageFrom(error)}`, "ERROR");
          if (returnToolId && returnToolId !== ROUTE_TOOL_ID) {
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
    await runPendingMove();
    await enqueue(async () => {
      if (!active) return;
      const result = await controller.click(event.pointerPosition);
      await renderSnapshot();
      if (!result.accepted) {
        const message = result.reason === "BARRIER"
          ? "Маршрут пересекает непроходимое препятствие"
          : result.reason === "NOT_ORTHOGONAL"
            ? "Можно двигаться только по горизонтали или вертикали"
            : result.reason === "IMPASSABLE"
              ? "Эта клетка непроходима"
              : result.reason === "OUTSIDE_FACTION_TERRITORY"
                ? "В мирное время эта армия не может покидать территорию своей фракции"
                : result.reason === "INSUFFICIENT_MOVEMENT_POINTS"
                  ? "Не хватает очков перемещения"
                  : "Эту клетку нельзя добавить в маршрут";
        await safeNotify(message, "WARNING");
      }
    });
    return false;
  };

  const keyDown = (event: KeyEvent) => {
    if (closed || (event.key === "Enter" && event.repeat)) return;
    void enqueue(async () => {
      if (!active) return;
      const result = controller.key(event.key);
      if (result.action === "EDITING") {
        await renderSnapshot();
      } else if (result.action === "CANCEL") {
        await finishSession(true);
      }
    });
  };

  const deactivate = () => {
    if (closed) return;
    generation += 1;
    void enqueue(() => finishSession(false));
  };

  const actionFilter = { activeTools: [ROUTE_TOOL_ID] };
  const finishAction: ToolAction = {
    id: ROUTE_FINISH_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Завершить маршрут", filter: actionFilter }],
    onClick: () => {
      void enqueue(async () => {
        if (!active) return;
        const result = controller.finish();
        if (result.action === "INVALID") {
          await safeNotify(result.reason === "EMPTY_ROUTE" ? "Добавьте хотя бы одну клетку маршрута" : "Маршрут сейчас недействителен", "WARNING");
          return;
        }
        if (result.action !== "COMMIT") return;
        try {
          await port.commitRoute(result.armyId, result.route, result.startCell, result.cells);
        } catch (error) {
          await safeNotify(`Не удалось сохранить маршрут: ${messageFrom(error)}`, "ERROR");
          return;
        }
        await finishSession(true);
      });
    }
  };
  const undoAction: ToolAction = {
    id: ROUTE_UNDO_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Шаг назад", filter: actionFilter }],
    onClick: () => { void enqueue(async () => { if (active) { controller.undo(); await renderSnapshot(); } }); }
  };
  const clearAction: ToolAction = {
    id: ROUTE_CLEAR_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Очистить маршрут", filter: actionFilter }],
    onClick: () => { void enqueue(async () => { if (active) { controller.clear(); await renderSnapshot(); } }); }
  };
  const cancelAction: ToolAction = {
    id: ROUTE_CANCEL_ACTION_ID,
    icons: [{ icon: iconUrl, label: "Отмена", filter: actionFilter }],
    onClick: () => { void enqueue(() => finishSession(true)); }
  };

  const tool: Tool = {
    id: ROUTE_TOOL_ID,
    icons: [{ icon: iconUrl, label: "Маршрут армии" }],
    defaultMetadata: {
      [ROUTE_ARMY_ID_KEY]: null,
      [ROUTE_RETURN_TOOL_KEY]: null
    }
  };
  const mode: ToolMode = {
    id: ROUTE_TOOL_MODE_ID,
    icons: [{
      icon: iconUrl,
      label: "Построить маршрут",
      filter: { activeTools: [ROUTE_TOOL_ID] }
    }],
    cursors: [{ cursor: "crosshair" }],
    onActivate: activate,
    onDeactivate: deactivate,
    onToolMove: (_context, event) => scheduleMove(event.pointerPosition),
    onToolClick: (_context, event) => click(event),
    onKeyDown: (_context, event) => keyDown(event)
  };

  await api.create(tool);
  const actions = [finishAction, undoAction, clearAction, cancelAction];
  try {
    await api.createMode(mode);
    for (const action of actions) await api.createAction(action);
  } catch (error) {
    for (const action of actions) { try { await api.removeAction(action.id); } catch {} }
    try { await api.removeMode(ROUTE_TOOL_MODE_ID); } catch {}
    await api.remove(ROUTE_TOOL_ID);
    throw error;
  }

  const remove = async () => {
    if (closed) return;
    closed = true;
    generation += 1;
    cancelMoveTimer();
    await tail;
    let failure: unknown;
    try {
      await finishSession(false);
    } catch (error) {
      failure = error;
    }
    for (const actionId of [ROUTE_FINISH_ACTION_ID, ROUTE_UNDO_ACTION_ID, ROUTE_CLEAR_ACTION_ID, ROUTE_CANCEL_ACTION_ID]) {
      try { await api.removeAction(actionId); } catch (error) { failure ??= error; }
    }
    try {
      await api.removeMode(ROUTE_TOOL_MODE_ID);
    } catch (error) {
      failure ??= error;
    }
    try {
      await api.remove(ROUTE_TOOL_ID);
    } catch (error) {
      failure ??= error;
    }
    if (failure) throw failure;
  };
  const registration = remove as RouteToolRegistration;
  registration.cancelSession = async () => {
    if (closed) return;
    generation += 1;
    cancelMoveTimer();
    await enqueue(() => finishSession(false));
  };
  return registration;
}
