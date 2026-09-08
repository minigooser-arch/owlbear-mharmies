import type { Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { expect, it, vi } from "vitest";
import type { GridRoutePort } from "../routes/routeMath";
import {
  DEFAULT_TERRAIN,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import { RouteToolController } from "./routeTool";
import { registerRouteTool, type RouteToolApi, type RouteToolIntegrationPort } from "./routeToolIntegration";

const gridPort: GridRoutePort = {
  distance: async () => 0,
  snapGridCenter: async (point) => ({
    x: Math.floor(point.x / 100) * 100 + 50,
    y: Math.floor(point.y / 100) * 100 + 50
  })
};

it("exposes a finish button above the last committed route point", async () => {
  const controller = new RouteToolController(gridPort);
  controller.activate({
    armyId: "army-a",
    start: { x: 50, y: 50 },
    startCell: { x: 0, y: 0 },
    gridDpi: 100,
    sideId: "red",
    movementUnits: 6,
    maxUnits: 6,
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    barriers: []
  });

  await controller.click({ x: 150, y: 50 });
  const snapshot = controller.snapshot();
  expect(snapshot?.finishButton).toMatchObject({
    label: "Завершить маршрут",
    position: { x: 150 }
  });
  expect(snapshot?.finishButton?.position.y).toBeLessThan(50);
});

class FakeToolApi implements RouteToolApi {
  tools: Tool[] = [];
  modes: ToolMode[] = [];
  actions: ToolAction[] = [];
  async create(tool: Tool) { this.tools.push(tool); }
  async remove() {}
  async createMode(mode: ToolMode) { this.modes.push(mode); }
  async removeMode() {}
  async createAction(action: ToolAction) { this.actions.push(action); }
  async removeAction() {}
  async setMetadata() {}
}

function context(): ToolContext {
  return {
    activeTool: ROUTE_TOOL_ID,
    activeMode: ROUTE_TOOL_MODE_ID,
    metadata: {
      [ROUTE_ARMY_ID_KEY]: "army-a",
      [ROUTE_RETURN_TOOL_KEY]: "select-tool"
    }
  } as ToolContext;
}

function event(x: number, y: number): ToolEvent {
  return { pointerPosition: { x, y }, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false } as ToolEvent;
}

it("commits and closes route planning automatically when the last movement point is spent", async () => {
  const api = new FakeToolApi();
  const commitRoute = vi.fn(async () => {});
  const clearPreview = vi.fn(async () => {});
  const restoreTool = vi.fn(async () => {});
  const port: RouteToolIntegrationPort = {
    loadSession: async (armyId) => ({
      armyId,
      start: { x: 50, y: 50 },
      startCell: { x: 0, y: 0 },
      gridDpi: 100,
      sideId: "red",
      movementUnits: 1,
      maxUnits: 1,
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: {
        version: 1,
        revision: 0,
        cells: {
          "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null }
        }
      },
      wars: [],
      barriers: []
    }),
    commitRoute,
    renderPreview: async () => {},
    clearPreview,
    notify: async () => {},
    restoreTool
  };

  await registerRouteTool(api, port, gridPort, "/icon.svg");
  const mode = api.modes[0];
  if (!mode) throw new Error("Mode missing");
  const ctx = context();
  mode.onActivate?.(ctx);
  await vi.waitFor(() => expect(api.modes.length).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 0));

  await mode.onToolClick?.(ctx, event(150, 50));

  await vi.waitFor(() => expect(commitRoute).toHaveBeenCalledTimes(1));
  expect(commitRoute).toHaveBeenCalledWith("army-a", [{ x: 150, y: 50 }], { x: 0, y: 0 }, [{ x: 1, y: 0 }]);
  expect(clearPreview).toHaveBeenCalled();
  expect(restoreTool).toHaveBeenCalledWith("select-tool");
});
