import type { Metadata, Tool, ToolAction, ToolContext, ToolEvent, ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TERRAIN, SHIP_ROUTE_SHIP_ID_KEY, SHIP_ROUTE_TOOL_ID, SHIP_ROUTE_TOOL_MODE_ID } from "../shared/constants";
import type { ShipRouteToolSnapshot } from "./shipRouteTool";
import { registerShipRouteTool, type ShipRouteToolApi, type ShipRouteToolIntegrationPort } from "./shipRouteToolIntegration";

class FakeApi implements ShipRouteToolApi {
  modes: ToolMode[] = [];
  async create(_tool: Tool) {}
  async remove(_id: string) {}
  async createMode(mode: ToolMode) { this.modes.push(mode); }
  async removeMode(_id: string) {}
  async createAction(_action: ToolAction) {}
  async removeAction(_id: string) {}
  async setMetadata(_toolId: string, _update: Partial<Metadata>) {}
}

function context(): ToolContext {
  return {
    activeTool: SHIP_ROUTE_TOOL_ID,
    activeMode: SHIP_ROUTE_TOOL_MODE_ID,
    metadata: { [SHIP_ROUTE_SHIP_ID_KEY]: "ship" }
  } as ToolContext;
}

function event(x: number): ToolEvent {
  return {
    pointerPosition: { x, y: 0 },
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false
  } as ToolEvent;
}

describe("ship route move performance", () => {
  it("coalesces a burst of pointer moves instead of queueing every Owlbear event", async () => {
    const api = new FakeApi();
    const rendered: ShipRouteToolSnapshot[] = [];
    let snapCalls = 0;
    const port: ShipRouteToolIntegrationPort = {
      loadSession: async (shipId) => ({
        shipId,
        start: { x: 0, y: 0 },
        startCell: { x: 0, y: 0 },
        gridDpi: 1,
        movementPoints: 5,
        maxMovementPoints: 5,
        facing: "EAST",
        terrain: {
          ...structuredClone(DEFAULT_TERRAIN),
          defaultTerrainId: "sea",
          types: {
            sea: {
              id: "sea",
              name: "Море",
              movementCostUnits: 2,
              enabled: true,
              movementDomains: ["SEA"],
              blocksNavalLos: false
            }
          }
        },
        gridMap: { version: 1, revision: 0, cells: {} }
      }),
      commitRoute: async () => {},
      renderPreview: async (snapshot) => { rendered.push(structuredClone(snapshot)); },
      clearPreview: async () => {},
      notify: async () => {},
      restoreTool: async () => {}
    };
    const grid = {
      snapGridCenter: async (point: { x: number; y: number }) => {
        snapCalls += 1;
        return { ...point };
      }
    };
    const cleanup = await registerShipRouteTool(api, port, grid, "/icon.svg");
    const mode = api.modes[0];
    if (!mode) throw new Error("Mode missing");

    mode.onActivate?.(context());
    await vi.waitFor(() => expect(rendered.length).toBeGreaterThan(0));
    const renderBaseline = rendered.length;
    const snapBaseline = snapCalls;

    try {
      for (let index = 0; index < 40; index += 1) {
        mode.onToolMove?.(context(), event(index / 10));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(rendered.length - renderBaseline).toBeLessThanOrEqual(3);
      expect(snapCalls - snapBaseline).toBeLessThanOrEqual(3);
    } finally {
      await cleanup();
    }
  });
});
