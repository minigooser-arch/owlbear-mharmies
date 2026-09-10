import type { KeyEvent, Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TERRAIN,
  SHIP_ROUTE_CANCEL_ACTION_ID,
  SHIP_ROUTE_CLEAR_ACTION_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_UNDO_ACTION_ID
} from "../shared/constants";
import type { ShipRouteToolSnapshot } from "./shipRouteTool";
import {
  registerShipRouteTool,
  type ShipRouteToolApi,
  type ShipRouteToolIntegrationPort
} from "./shipRouteToolIntegration";

class FakeToolApi implements ShipRouteToolApi {
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
  return { activeTool: SHIP_ROUTE_TOOL_ID, activeMode: SHIP_ROUTE_TOOL_MODE_ID, metadata } as ToolContext;
}

function toolEvent(x: number, y: number): ToolEvent {
  return { pointerPosition: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false } as ToolEvent;
}

function keyEvent(key: string, repeat = false): KeyEvent {
  return { key, code: key, repeat, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false } as KeyEvent;
}

function navalTerrain() {
  return {
    ...structuredClone(DEFAULT_TERRAIN),
    defaultTerrainId: "sea",
    types: {
      ...structuredClone(DEFAULT_TERRAIN.types),
      sea: { id: "sea", name: "Море", movementCostUnits: 2, enabled: true, movementDomains: ["SEA" as const], blocksNavalLos: false }
    }
  };
}

function fixture() {
  const api = new FakeToolApi();
  const commits: unknown[][] = [];
  const rendered: ShipRouteToolSnapshot[] = [];
  const restored: string[] = [];
  let clearCount = 0;
  const port: ShipRouteToolIntegrationPort = {
    loadSession: async (shipId) => ({
      shipId,
      start: { x: 50, y: 50 },
      startCell: { x: 0, y: 0 },
      gridDpi: 100,
      movementPoints: 4,
      maxMovementPoints: 4,
      facing: "EAST",
      terrain: navalTerrain(),
      gridMap: { version: 1, revision: 0, cells: {} }
    }),
    commitRoute: async (...args) => { commits.push(structuredClone(args)); },
    renderPreview: async (snapshot) => { rendered.push(structuredClone(snapshot)); },
    clearPreview: async () => { clearCount += 1; },
    notify: async () => {},
    restoreTool: async (toolId) => { restored.push(toolId); }
  };
  return {
    api,
    port,
    commits,
    rendered,
    restored,
    get clearCount() { return clearCount; },
    grid: { snapGridCenter: async (point: { x: number; y: number }) => ({ x: Math.floor(point.x / 100) * 100 + 50, y: Math.floor(point.y / 100) * 100 + 50 }) }
  };
}

function action(api: FakeToolApi, id: string): ToolAction {
  const found = api.actions.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing action ${id}`);
  return found;
}

describe("ship route tool SDK integration", () => {
  it("registers ship route tool with undo, clear, and cancel actions only", async () => {
    const f = fixture();
    const cleanup = await registerShipRouteTool(f.api, f.port, f.grid, "/icon.svg");
    expect(f.api.tools[0]?.id).toBe(SHIP_ROUTE_TOOL_ID);
    expect(f.api.modes[0]?.id).toBe(SHIP_ROUTE_TOOL_MODE_ID);
    expect(f.api.actions.map((candidate) => candidate.id)).toEqual([
      SHIP_ROUTE_UNDO_ACTION_ID,
      SHIP_ROUTE_CLEAR_ACTION_ID,
      SHIP_ROUTE_CANCEL_ACTION_ID
    ]);
    await cleanup();
    expect(f.api.removed).toEqual([
      SHIP_ROUTE_UNDO_ACTION_ID,
      SHIP_ROUTE_CLEAR_ACTION_ID,
      SHIP_ROUTE_CANCEL_ACTION_ID,
      SHIP_ROUTE_TOOL_MODE_ID,
      SHIP_ROUTE_TOOL_ID
    ]);
  });

  it("commits exactly once by clicking the finish affordance above the last route cell", async () => {
    const f = fixture();
    await registerShipRouteTool(f.api, f.port, f.grid, "/icon.svg");
    const mode = f.api.modes[0];
    if (!mode) throw new Error("Mode missing");
    const ctx = context({ [SHIP_ROUTE_SHIP_ID_KEY]: "ship", [SHIP_ROUTE_RETURN_TOOL_KEY]: "select-tool" });
    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));
    expect(await mode.onToolClick?.(ctx, toolEvent(150, 50))).toBe(false);
    mode.onKeyDown?.(ctx, keyEvent("Enter"));
    await Promise.resolve();
    expect(f.commits).toEqual([]);
    expect(await mode.onToolClick?.(ctx, toolEvent(150, 15))).toBe(false);
    await vi.waitFor(() => expect(f.commits).toEqual([["ship", { x: 0, y: 0 }, [{ x: 1, y: 0 }]]]));
    expect(f.restored).toEqual(["select-tool"]);
  });

  it("can plan only a turn by using the map Turn control and one of three alternative facings", async () => {
    const f = fixture();
    await registerShipRouteTool(f.api, f.port, f.grid, "/icon.svg");
    const mode = f.api.modes[0];
    if (!mode) throw new Error("Mode missing");
    const ctx = context({ [SHIP_ROUTE_SHIP_ID_KEY]: "ship", [SHIP_ROUTE_RETURN_TOOL_KEY]: "select-tool" });
    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));

    // Start is (50, 50). Turn control is below Finish at y=15.
    expect(await mode.onToolClick?.(ctx, toolEvent(50, 15))).toBe(false);
    await vi.waitFor(() => expect(f.rendered.at(-1)?.turnChoices).toHaveLength(3));
    expect(f.rendered.at(-1)?.turnChoices?.map((choice) => choice.facing)).toEqual(["NORTH", "SOUTH", "WEST"]);

    const west = f.rendered.at(-1)?.turnChoices?.find((choice) => choice.facing === "WEST");
    if (!west) throw new Error("West choice missing");
    expect(await mode.onToolClick?.(ctx, toolEvent(west.position.x, west.position.y))).toBe(false);
    await vi.waitFor(() => expect(f.rendered.at(-1)?.plannedFacing).toBe("WEST"));

    const finish = f.rendered.at(-1)?.finishButton;
    if (!finish) throw new Error("Finish button missing");
    expect(await mode.onToolClick?.(ctx, toolEvent(finish.position.x, finish.position.y))).toBe(false);
    await vi.waitFor(() => expect(f.commits).toEqual([["ship", { x: 0, y: 0 }, [], "WEST"]]));
    expect(f.restored).toEqual(["select-tool"]);
  });

  it("supports undo, clear, and cancel without committing", async () => {
    const f = fixture();
    await registerShipRouteTool(f.api, f.port, f.grid, "/icon.svg");
    const mode = f.api.modes[0];
    if (!mode) throw new Error("Mode missing");
    const ctx = context({ [SHIP_ROUTE_SHIP_ID_KEY]: "ship" });
    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));
    await mode.onToolClick?.(ctx, toolEvent(150, 50));
    action(f.api, SHIP_ROUTE_UNDO_ACTION_ID).onClick?.(ctx, SHIP_ROUTE_UNDO_ACTION_ID);
    await vi.waitFor(() => expect(f.rendered.at(-1)?.cells).toEqual([]));
    await mode.onToolClick?.(ctx, toolEvent(150, 50));
    action(f.api, SHIP_ROUTE_CLEAR_ACTION_ID).onClick?.(ctx, SHIP_ROUTE_CLEAR_ACTION_ID);
    await vi.waitFor(() => expect(f.rendered.at(-1)?.cells).toEqual([]));
    action(f.api, SHIP_ROUTE_CANCEL_ACTION_ID).onClick?.(ctx, SHIP_ROUTE_CANCEL_ACTION_ID);
    await vi.waitFor(() => expect(f.clearCount).toBeGreaterThan(0));
    expect(f.commits).toEqual([]);
  });
});
