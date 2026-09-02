import type { KeyEvent, Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GridRoutePort } from "../routes/routeMath";
import {
  DEFAULT_TERRAIN,
  ROUTE_ARMY_ID_KEY,
  ROUTE_CANCEL_ACTION_ID,
  ROUTE_CLEAR_ACTION_ID,
  ROUTE_FINISH_ACTION_ID,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID,
  ROUTE_UNDO_ACTION_ID
} from "../shared/constants";
import type { RouteToolSnapshot } from "./routeTool";
import { registerRouteTool, type RouteToolApi, type RouteToolIntegrationPort } from "./routeToolIntegration";

class FakeToolApi implements RouteToolApi {
  tools: Tool[] = [];
  modes: ToolMode[] = [];
  actions: ToolAction[] = [];
  removed: string[] = [];
  metadataUpdates: Array<{ toolId: string; update: Record<string, unknown> }> = [];
  async create(tool: Tool) { this.tools.push(tool); }
  async remove(id: string) { this.removed.push(id); }
  async createMode(mode: ToolMode) { this.modes.push(mode); }
  async removeMode(id: string) { this.removed.push(id); }
  async createAction(action: ToolAction) { this.actions.push(action); }
  async removeAction(id: string) { this.removed.push(id); }
  async setMetadata(toolId: string, update: Record<string, unknown>) { this.metadataUpdates.push({ toolId, update }); }
}

function context(metadata: Record<string, unknown> = {}): ToolContext {
  return { activeTool: ROUTE_TOOL_ID, activeMode: ROUTE_TOOL_MODE_ID, metadata } as ToolContext;
}
function toolEvent(x: number, y: number): ToolEvent {
  return { pointerPosition: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false } as ToolEvent;
}
function keyEvent(key: string, repeat = false): KeyEvent {
  return { key, code: key, repeat, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false } as KeyEvent;
}
function fixture() {
  const api = new FakeToolApi();
  const commits: Array<{ armyId: string; cells: readonly { x: number; y: number }[] }> = [];
  const rendered: RouteToolSnapshot[] = [];
  const restored: string[] = [];
  let clearCount = 0;
  const port: RouteToolIntegrationPort = {
    loadSession: async (armyId) => ({
      armyId,
      start: { x: 50, y: 50 }, startCell: { x: 0, y: 0 }, gridDpi: 100,
      sideId: "red", movementUnits: 6, maxUnits: 6, terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: { version: 1, revision: 0, cells: {
        "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
      } }, wars: [], barriers: []
    }),
    commitRoute: async (armyId, _route, _startCell, cells) => { commits.push({ armyId, cells: structuredClone(cells) }); },
    renderPreview: async (snapshot) => { rendered.push(structuredClone(snapshot)); },
    clearPreview: async () => { clearCount += 1; },
    notify: async () => {},
    restoreTool: async (toolId) => { restored.push(toolId); }
  };
  const distancePort: GridRoutePort = {
    distance: async () => 0,
    snapGridCenter: async (point) => ({ x: Math.floor(point.x / 100) * 100 + 50, y: Math.floor(point.y / 100) * 100 + 50 })
  };
  return { api, port, distancePort, commits, rendered, restored, get clearCount() { return clearCount; } };
}

function action(api: FakeToolApi, id: string): ToolAction {
  const found = api.actions.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing action ${id}`);
  return found;
}

describe("route tool SDK integration", () => {
  it("registers the tool, mode, and four visible actions", async () => {
    const f = fixture();
    const cleanup = await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    expect(f.api.tools[0]?.id).toBe(ROUTE_TOOL_ID);
    expect(f.api.modes[0]?.id).toBe(ROUTE_TOOL_MODE_ID);
    expect(f.api.actions.map((candidate) => candidate.id)).toEqual([
      ROUTE_FINISH_ACTION_ID, ROUTE_UNDO_ACTION_ID, ROUTE_CLEAR_ACTION_ID, ROUTE_CANCEL_ACTION_ID
    ]);
    await cleanup();
    expect(f.api.removed).toEqual([
      ROUTE_FINISH_ACTION_ID, ROUTE_UNDO_ACTION_ID, ROUTE_CLEAR_ACTION_ID, ROUTE_CANCEL_ACTION_ID,
      ROUTE_TOOL_MODE_ID, ROUTE_TOOL_ID
    ]);
  });

  it("does not commit on Enter and commits exactly once from the finish action", async () => {
    const f = fixture();
    await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = f.api.modes[0];
    if (!mode) throw new Error("Mode missing");
    const ctx = context({ [ROUTE_ARMY_ID_KEY]: "army-a", [ROUTE_RETURN_TOOL_KEY]: "select-tool" });
    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));
    expect(await mode.onToolClick?.(ctx, toolEvent(150, 50))).toBe(false);
    mode.onKeyDown?.(ctx, keyEvent("Enter"));
    await Promise.resolve();
    expect(f.commits).toEqual([]);

    action(f.api, ROUTE_FINISH_ACTION_ID).onClick?.(ctx, ROUTE_FINISH_ACTION_ID);
    await vi.waitFor(() => expect(f.commits).toEqual([{ armyId: "army-a", cells: [{ x: 1, y: 0 }] }]));
    expect(f.restored).toEqual(["select-tool"]);
  });

  it("supports undo, clear, and cancel actions without committing", async () => {
    const f = fixture();
    await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = f.api.modes[0];
    if (!mode) throw new Error("Mode missing");
    const ctx = context({ [ROUTE_ARMY_ID_KEY]: "army-a" });
    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));
    await mode.onToolClick?.(ctx, toolEvent(150, 50));
    action(f.api, ROUTE_UNDO_ACTION_ID).onClick?.(ctx, ROUTE_UNDO_ACTION_ID);
    await vi.waitFor(() => expect(f.rendered.at(-1)?.cells).toEqual([]));
    await mode.onToolClick?.(ctx, toolEvent(150, 50));
    action(f.api, ROUTE_CLEAR_ACTION_ID).onClick?.(ctx, ROUTE_CLEAR_ACTION_ID);
    await vi.waitFor(() => expect(f.rendered.at(-1)?.cells).toEqual([]));
    action(f.api, ROUTE_CANCEL_ACTION_ID).onClick?.(ctx, ROUTE_CANCEL_ACTION_ID);
    await vi.waitFor(() => expect(f.clearCount).toBeGreaterThan(0));
    expect(f.commits).toEqual([]);
  });
});
