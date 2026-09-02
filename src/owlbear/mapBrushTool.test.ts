import type { ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import {
  mapBrushSettingsFromMetadata,
  registerMapBrushTool,
  type MapBrushSettings,
  type MapBrushToolApi
} from "./mapBrushTool";
import {
  MAP_BRUSH_MODE_KEY,
  MAP_BRUSH_SIZE_KEY,
  MAP_BRUSH_TERRAIN_ID_KEY,
  MAP_BRUSH_STATE_ID_KEY
} from "../shared/constants";
import type { GridCellCoord } from "../shared/types";

function event(x: number, y: number) {
  return { pointerPosition: { x, y } } as never;
}

function apiHarness() {
  let registeredMode: ToolMode | undefined;
  const created: string[] = [];
  const api: MapBrushToolApi = {
    create: async (tool) => { created.push(tool.id); },
    remove: async () => undefined,
    createMode: async (value) => { registeredMode = value; },
    removeMode: async () => undefined,
    setMetadata: async () => undefined
  };
  return {
    api,
    created,
    get mode(): ToolMode {
      if (!registeredMode) throw new Error("Expected map brush tool mode to be registered");
      return registeredMode;
    }
  };
}

function portHarness(role: "GM" | "PLAYER") {
  const commits: Array<{ settings: MapBrushSettings; cells: GridCellCoord[] }> = [];
  return {
    port: {
      getRole: async () => role,
      getGridDpi: async () => 100,
      commitStroke: async (settings: MapBrushSettings, cells: readonly GridCellCoord[]) => {
        commits.push({ settings, cells: cells.map((cell) => ({ ...cell })) });
      },
      renderPreview: async () => undefined,
      clearPreview: async () => undefined,
      notify: async () => undefined
    },
    commits
  };
}

describe("map brush tool", () => {
  it("does not register an editable tool for players", async () => {
    const api = apiHarness();
    const port = portHarness("PLAYER");
    const registration = await registerMapBrushTool(api.api as never, port.port, "/icon.png");
    expect(registration.registered).toBe(false);
    expect(api.created).toEqual([]);
  });

  it("submits one batch for a drag stroke across many cells", async () => {
    const api = apiHarness();
    const port = portHarness("GM");
    await registerMapBrushTool(api.api as never, port.port, "/icon.png");
    const context = {
      metadata: {
        [MAP_BRUSH_MODE_KEY]: "TERRAIN",
        [MAP_BRUSH_SIZE_KEY]: 1,
        [MAP_BRUSH_TERRAIN_ID_KEY]: "forest"
      }
    } as never;

    api.mode.onToolDragStart?.(context, event(50, 50));
    api.mode.onToolDragMove?.(context, event(450, 50));
    api.mode.onToolDragEnd?.(context, event(450, 50));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(port.commits).toHaveLength(1);
    expect(port.commits[0]?.settings.mode).toBe("TERRAIN");
    expect(port.commits[0]?.settings.terrainId).toBe("forest");
    expect(port.commits[0]?.cells.map((cell) => cell.x)).toEqual([0, 1, 2, 3, 4]);
  });

  it("parses 3x3 brush metadata", () => {
    expect(mapBrushSettingsFromMetadata({
      [MAP_BRUSH_MODE_KEY]: "IMPASSABLE",
      [MAP_BRUSH_SIZE_KEY]: 3
    })).toMatchObject({ mode: "IMPASSABLE", size: 3, impassable: true });
  });
});


it("parses a state ownership brush", () => {
  expect(mapBrushSettingsFromMetadata({
    [MAP_BRUSH_MODE_KEY]: "RECOGNIZED_STATE",
    [MAP_BRUSH_STATE_ID_KEY]: "russia-state",
    [MAP_BRUSH_SIZE_KEY]: 5
  })).toMatchObject({ mode: "RECOGNIZED_STATE", stateId: "russia-state", size: 5 });
});
