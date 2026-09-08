import type { Metadata, Tool, ToolAction, ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import {
  ROUTE_CANCEL_ACTION_ID,
  ROUTE_CLEAR_ACTION_ID,
  ROUTE_FINISH_ACTION_ID,
  ROUTE_UNDO_ACTION_ID,
  SHIP_ROUTE_CANCEL_ACTION_ID,
  SHIP_ROUTE_CLEAR_ACTION_ID,
  SHIP_ROUTE_FINISH_ACTION_ID,
  SHIP_ROUTE_UNDO_ACTION_ID
} from "../shared/constants";
import { registerRouteTool, type RouteToolApi, type RouteToolIntegrationPort } from "./routeToolIntegration";
import { registerShipRouteTool, type ShipRouteToolApi, type ShipRouteToolIntegrationPort } from "./shipRouteToolIntegration";

class Api implements RouteToolApi, ShipRouteToolApi {
  actions: ToolAction[] = [];
  async create(_tool: Tool) {}
  async remove(_id: string) {}
  async createMode(_mode: ToolMode) {}
  async removeMode(_id: string) {}
  async createAction(action: ToolAction) { this.actions.push(action); }
  async removeAction(_id: string) {}
  async setMetadata(_toolId: string, _update: Partial<Metadata>) {}
}

const routePort = {
  loadSession: async () => { throw new Error("unused"); },
  commitRoute: async () => {},
  renderPreview: async () => {},
  clearPreview: async () => {},
  notify: async () => {},
  restoreTool: async () => {}
} as unknown as RouteToolIntegrationPort;

const shipPort = {
  loadSession: async () => { throw new Error("unused"); },
  commitRoute: async () => {},
  renderPreview: async () => {},
  clearPreview: async () => {},
  notify: async () => {},
  restoreTool: async () => {}
} as unknown as ShipRouteToolIntegrationPort;

const grid = {
  distance: async () => 0,
  snapGridCenter: async (point: { x: number; y: number }) => ({ ...point })
};

describe("route completion map-only regression", () => {
  it("does not register a separate army route finish ToolAction", async () => {
    const api = new Api();
    const cleanup = await registerRouteTool(api, routePort, grid, "/icon.svg");
    expect(api.actions.map((action) => action.id)).toEqual([
      ROUTE_UNDO_ACTION_ID,
      ROUTE_CLEAR_ACTION_ID,
      ROUTE_CANCEL_ACTION_ID
    ]);
    expect(api.actions.some((action) => action.id === ROUTE_FINISH_ACTION_ID)).toBe(false);
    await cleanup();
  });

  it("does not register a separate ship route finish ToolAction", async () => {
    const api = new Api();
    const cleanup = await registerShipRouteTool(api, shipPort, grid, "/icon.svg");
    expect(api.actions.map((action) => action.id)).toEqual([
      SHIP_ROUTE_UNDO_ACTION_ID,
      SHIP_ROUTE_CLEAR_ACTION_ID,
      SHIP_ROUTE_CANCEL_ACTION_ID
    ]);
    expect(api.actions.some((action) => action.id === SHIP_ROUTE_FINISH_ACTION_ID)).toBe(false);
    await cleanup();
  });
});
