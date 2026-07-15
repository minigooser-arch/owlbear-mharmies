import type { KeyEvent, Tool, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GridRoutePort } from "../routes/routeMath";
import {
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import type { RouteToolSnapshot } from "./routeTool";
import { notificationMessage } from "./notifications";
import {
  registerRouteTool,
  type RouteToolApi,
  type RouteToolIntegrationPort
} from "./routeToolIntegration";

class FakeToolApi implements RouteToolApi {
  tools: Tool[] = [];
  modes: ToolMode[] = [];
  removed: string[] = [];
  metadataUpdates: Array<{ toolId: string; update: Record<string, unknown> }> = [];

  async create(tool: Tool) { this.tools.push(tool); }
  async remove(id: string) { this.removed.push(id); }
  async createMode(mode: ToolMode) { this.modes.push(mode); }
  async removeMode(id: string) { this.removed.push(id); }
  async setMetadata(toolId: string, update: Record<string, unknown>) {
    this.metadataUpdates.push({ toolId, update });
  }
}

function context(metadata: Record<string, unknown> = {}): ToolContext {
  return { activeTool: ROUTE_TOOL_ID, activeMode: ROUTE_TOOL_MODE_ID, metadata };
}

function toolEvent(x: number, y: number): ToolEvent {
  return {
    pointerPosition: { x, y },
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false
  };
}

function keyEvent(key: string, repeat = false): KeyEvent {
  return {
    key,
    code: key,
    repeat,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false
  };
}

function registeredMode(api: FakeToolApi): ToolMode {
  const mode = api.modes[0];
  if (!mode) throw new Error("Route tool mode was not registered");
  return mode;
}

function fixture() {
  const api = new FakeToolApi();
  const commits: Array<{ armyId: string; route: readonly { x: number; y: number }[] }> = [];
  const rendered: RouteToolSnapshot[] = [];
  const restored: string[] = [];
  const notifications: string[] = [];
  let clearCount = 0;
  const port: RouteToolIntegrationPort = {
    loadSession: async (armyId) => ({
      armyId,
      start: { x: 0, y: 0 },
      maxCells: 5,
      barriers: []
    }),
    commitRoute: async (armyId, route) => {
      commits.push({ armyId, route: structuredClone(route) });
    },
    renderPreview: async (snapshot) => {
      rendered.push(structuredClone(snapshot));
    },
    clearPreview: async () => { clearCount += 1; },
    notify: async (message) => { notifications.push(message); },
    restoreTool: async (toolId) => { restored.push(toolId); }
  };
  const distance = vi.fn(async (from: { x: number; y: number }, to: { x: number; y: number }) =>
    Math.hypot(to.x - from.x, to.y - from.y)
  );
  const distancePort: GridRoutePort = {
    distance,
    snapGridCenter: async (point) => ({ ...point })
  };
  return {
    api,
    port,
    distancePort,
    commits,
    rendered,
    restored,
    notifications,
    distance,
    get clearCount() { return clearCount; }
  };
}

describe("route tool SDK integration", () => {
  it("registers and removes one tool and mode", async () => {
    const f = fixture();
    const cleanup = await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");

    expect(f.api.tools).toHaveLength(1);
    expect(f.api.tools[0]?.id).toBe(ROUTE_TOOL_ID);
    expect(f.api.modes).toHaveLength(1);
    expect(f.api.modes[0]?.id).toBe(ROUTE_TOOL_MODE_ID);
    expect(f.api.modes[0]?.icons[0]?.filter).toEqual({ activeTools: [ROUTE_TOOL_ID] });

    await cleanup();
    expect(f.api.removed).toEqual([ROUTE_TOOL_MODE_ID, ROUTE_TOOL_ID]);
  });

  it("commits exactly once on non-repeated Enter and cleans the preview", async () => {
    const f = fixture();
    const cleanup = await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });

    mode.onActivate?.(ctx);
    expect(await mode.onToolClick?.(ctx, toolEvent(1, 0))).toBe(false);
    mode.onKeyDown?.(ctx, keyEvent("Enter", false));
    mode.onKeyDown?.(ctx, keyEvent("Enter", true));

    await vi.waitFor(() => {
      expect(f.commits).toEqual([{ armyId: "army-a", route: [{ x: 1, y: 0 }] }]);
      expect(f.clearCount).toBe(1);
      expect(f.restored).toEqual(["select-tool"]);
      expect(f.api.metadataUpdates.at(-1)).toEqual({
        toolId: ROUTE_TOOL_ID,
        update: {
          [ROUTE_ARMY_ID_KEY]: null,
          [ROUTE_RETURN_TOOL_KEY]: null
        }
      });
    });
    await cleanup();
  });

  it("cancels with Escape without committing and ignores missing metadata", async () => {
    const f = fixture();
    await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });
    mode.onActivate?.(ctx);
    mode.onKeyDown?.(ctx, keyEvent("Escape"));
    await vi.waitFor(() => expect(f.restored).toEqual(["select-tool"]));
    expect(f.commits).toEqual([]);

    mode.onActivate?.(context());
    await vi.waitFor(() => expect(f.notifications.length).toBeGreaterThan(0));
  });

  it("coalesces pointer moves to at most twelve starts per second", async () => {
    const f = fixture();
    const cleanup = await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });
    mode.onActivate?.(ctx);

    mode.onToolMove?.(ctx, toolEvent(1, 0));
    mode.onToolMove?.(ctx, toolEvent(2, 0));
    mode.onToolMove?.(ctx, toolEvent(3, 0));

    await vi.waitFor(() => {
      expect(f.rendered.at(-1)?.preview?.point).toEqual({ x: 3, y: 0 });
    });
    expect(f.distance).toHaveBeenCalledTimes(2);
    await cleanup();
  });

  it("returns to the previous tool when session loading is rejected", async () => {
    const f = fixture();
    f.port.loadSession = vi.fn(async () => {
      throw new Error("NOT_SIDE_LEADER");
    });
    await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });

    mode.onActivate?.(ctx);
    expect(await mode.onToolClick?.(ctx, toolEvent(1, 0))).toBe(false);

    await vi.waitFor(() => expect(f.restored).toEqual(["select-tool"]));
    expect(f.notifications.join(" ")).toContain(notificationMessage("NOT_SIDE_LEADER"));
  });

  it("cleans up and restores the previous tool when commit is rejected", async () => {
    const f = fixture();
    f.port.commitRoute = vi.fn(async () => {
      throw new Error("REVISION_CONFLICT");
    });
    await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });

    mode.onActivate?.(ctx);
    expect(await mode.onToolClick?.(ctx, toolEvent(1, 0))).toBe(false);
    mode.onKeyDown?.(ctx, keyEvent("Enter"));

    await vi.waitFor(() => expect(f.restored).toEqual(["select-tool"]));
    expect(f.clearCount).toBe(1);
    expect(f.notifications.join(" ")).toContain(notificationMessage("REVISION_CONFLICT"));
  });

  it("retries preview cleanup during teardown after a transient failure", async () => {
    const f = fixture();
    const clearPreview = vi.fn()
      .mockRejectedValueOnce(new Error("temporary local-item failure"))
      .mockResolvedValue(undefined);
    f.port.clearPreview = clearPreview;
    const cleanup = await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });

    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));
    mode.onKeyDown?.(ctx, keyEvent("Escape"));
    await vi.waitFor(() => expect(clearPreview).toHaveBeenCalledTimes(1));
    await cleanup();

    expect(clearPreview).toHaveBeenCalledTimes(2);
    expect(f.api.removed).toEqual([ROUTE_TOOL_MODE_ID, ROUTE_TOOL_ID]);
  });

  it("cancels an active route session without unregistering the tool", async () => {
    const f = fixture();
    const registration = await registerRouteTool(f.api, f.port, f.distancePort, "/icon.svg");
    const mode = registeredMode(f.api);
    const ctx = context({
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    });
    mode.onActivate?.(ctx);
    await vi.waitFor(() => expect(f.rendered.length).toBeGreaterThan(0));

    await registration.cancelSession();
    expect(f.api.removed).toEqual([]);
    expect(f.clearCount).toBe(1);
    expect(await mode.onToolClick?.(ctx, toolEvent(1, 0))).toBe(false);
    expect(f.commits).toEqual([]);

    await registration();
  });
});
