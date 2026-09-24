import { afterEach, expect, it, vi } from "vitest";
import {
  CELL_COORDINATE_TOOL_ID,
  CELL_COORDINATE_TOOL_MODE_ID,
  CITY_CELL_PICK_CHANNEL,
  CITY_CELL_PICK_SESSION_KEY
} from "../shared/constants";
import { CityCellPickerSession, type CityCellPickerPort } from "./cityCellPickerSession";

function harness(role: "GM" | "PLAYER" = "GM", activate = true) {
  const state = { activeTool: "select-tool", activeMode: undefined as string | undefined, metadata: {} as Record<string, unknown> };
  const listener = { cell: undefined as ((value: unknown) => void) | undefined, tool: undefined as ((toolId: string) => void) | undefined };
  const unsubscribeCell = vi.fn(() => { listener.cell = undefined; });
  const unsubscribeTool = vi.fn(() => { listener.tool = undefined; });
  const port: CityCellPickerPort = {
    getRole: async () => role,
    getActiveTool: async () => state.activeTool,
    getActiveToolMode: async () => state.activeMode,
    setToolMetadata: async (update) => { Object.assign(state.metadata, update); },
    activateTool: async (toolId) => { if (activate) state.activeTool = toolId; },
    activateMode: async (_toolId, modeId) => { if (activate) state.activeMode = modeId; },
    onCellPick: (callback) => { listener.cell = callback; return unsubscribeCell; },
    onToolChange: (callback) => { listener.tool = callback; return unsubscribeTool; },
    createSessionId: () => "city-session-1",
    showError: vi.fn(async () => undefined),
    activationTimeoutMs: 30
  };
  const onChange = vi.fn();
  const session = new CityCellPickerSession(port, onChange);
  return { session, state, listener, onChange, unsubscribeCell, unsubscribeTool, port };
}

afterEach(() => vi.useRealTimers());

it("activates the coordinate tool and accepts unique cells only from its current session", async () => {
  const { session, state, onChange } = harness();
  session.start();
  await expect(session.open()).resolves.toBe(true);
  expect(state.activeTool).toBe(CELL_COORDINATE_TOOL_ID);
  expect(state.activeMode).toBe(CELL_COORDINATE_TOOL_MODE_ID);
  expect(state.metadata[CITY_CELL_PICK_SESSION_KEY]).toBe("city-session-1");

  await session.receive({ sessionId: "old-session", x: 1, y: 1 });
  await session.receive({ sessionId: "city-session-1", x: 2, y: 3 });
  await session.receive({ sessionId: "city-session-1", x: 2, y: 3 });
  await session.receive({ sessionId: "city-session-1", x: 2.5, y: 3 });

  expect(session.snapshot).toEqual({ sessionId: "city-session-1", cells: [{ x: 2, y: 3 }] });
  expect(onChange).toHaveBeenLastCalledWith({ sessionId: "city-session-1", cells: [{ x: 2, y: 3 }] });
});

it("restores the previous tool when the picker is closed", async () => {
  const { session, state } = harness();
  await session.open();
  await session.close();
  expect(state.activeTool).toBe("select-tool");
  expect(state.metadata[CITY_CELL_PICK_SESSION_KEY]).toBeNull();
  expect(session.snapshot).toBeUndefined();
});

it("clears the session without changing tools again when the user switches away", async () => {
  const { session, state } = harness();
  await session.open();
  state.activeTool = "draw-tool";
  await session.handleToolChange("draw-tool");
  expect(state.activeTool).toBe("draw-tool");
  expect(state.metadata[CITY_CELL_PICK_SESSION_KEY]).toBeNull();
  expect(session.snapshot).toBeUndefined();
});

it("cleans up metadata and listeners when activation fails or the session stops", async () => {
  const failed = harness("GM", false);
  failed.session.start();
  await expect(failed.session.open()).resolves.toBe(false);
  expect(failed.state.metadata[CITY_CELL_PICK_SESSION_KEY]).toBeNull();
  expect(failed.session.snapshot).toBeUndefined();

  const active = harness();
  active.session.start();
  await active.session.open();
  await active.session.stop();
  expect(active.unsubscribeCell).toHaveBeenCalledOnce();
  expect(active.unsubscribeTool).toHaveBeenCalledOnce();
  expect(active.state.metadata[CITY_CELL_PICK_SESSION_KEY]).toBeNull();
  expect(active.session.snapshot).toBeUndefined();
});

it("does not activate the picker for a player", async () => {
  const { session, state } = harness("PLAYER");
  await expect(session.open()).resolves.toBe(false);
  expect(state.activeTool).toBe("select-tool");
});

it("subscribes to the city-picker broadcast channel", () => {
  const { session, port, listener } = harness();
  const subscribe = vi.spyOn(port, "onCellPick");
  session.start();
  expect(subscribe).toHaveBeenCalledOnce();
  expect(subscribe).toHaveBeenCalledWith(expect.any(Function));
  expect(CITY_CELL_PICK_CHANNEL).toContain("city-cell-pick");
  listener.cell?.({ sessionId: "stale", x: 1, y: 1 });
});
