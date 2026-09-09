import { describe, expect, it } from "vitest";
import {
  METADATA_KEYS,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { RouteContextMenuService, type RouteContextMenuServicePort } from "./routeContextMenuService";

class MemoryPort implements RouteContextMenuServicePort {
  localItems: SceneItemRecord[] = [];
  sceneItems: SceneItemRecord[] = [];
  metadataCalls: Array<{ toolId: string; metadata: Record<string, unknown> }> = [];
  activatedTools: string[] = [];
  activatedModes: string[] = [];
  messages: string[] = [];

  async getLocalItems() { return structuredClone(this.localItems); }
  async getSceneItems() { return structuredClone(this.sceneItems); }
  async getActiveTool() { return "obr/selection"; }
  async setToolMetadata(toolId: string, metadata: Record<string, unknown>) {
    this.metadataCalls.push({ toolId, metadata: structuredClone(metadata) });
  }
  async activateTool(toolId: string) { this.activatedTools.push(toolId); }
  async activateMode(modeId: string) { this.activatedModes.push(modeId); }
  async show(message: string) { this.messages.push(message); }
}

function clone(id: string, sourceItemId: string): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    position: { x: 0, y: 0 },
    metadata: { [METADATA_KEYS.localClone]: { sourceItemId, hasRoute: false } }
  };
}

function source(id: string, kind: "ARMY" | "SHIP"): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    position: { x: 0, y: 0 },
    metadata: kind === "ARMY"
      ? { [METADATA_KEYS.army]: { registered: true } }
      : { [METADATA_KEYS.ship]: { registered: true } }
  };
}

describe("RouteContextMenuService", () => {
  it("opens the land route tool for an army clone using the authoritative source id", async () => {
    const port = new MemoryPort();
    port.localItems = [clone("clone-army", "army")];
    port.sceneItems = [source("army", "ARMY")];

    await new RouteContextMenuService(port).openRouteForLocalItem("clone-army");

    expect(port.metadataCalls).toEqual([{
      toolId: ROUTE_TOOL_ID,
      metadata: {
        [ROUTE_ARMY_ID_KEY]: "army",
        [ROUTE_RETURN_TOOL_KEY]: "obr/selection"
      }
    }]);
    expect(port.activatedTools).toEqual([ROUTE_TOOL_ID]);
    expect(port.activatedModes).toEqual([ROUTE_TOOL_MODE_ID]);
  });

  it("opens the ship route tool for a ship clone using the authoritative source id", async () => {
    const port = new MemoryPort();
    port.localItems = [clone("clone-ship", "ship")];
    port.sceneItems = [source("ship", "SHIP")];

    await new RouteContextMenuService(port).openRouteForLocalItem("clone-ship");

    expect(port.metadataCalls).toEqual([{
      toolId: SHIP_ROUTE_TOOL_ID,
      metadata: {
        [SHIP_ROUTE_SHIP_ID_KEY]: "ship",
        [SHIP_ROUTE_RETURN_TOOL_KEY]: "obr/selection"
      }
    }]);
    expect(port.activatedTools).toEqual([SHIP_ROUTE_TOOL_ID]);
    expect(port.activatedModes).toEqual([SHIP_ROUTE_TOOL_MODE_ID]);
  });

  it("does not open a route tool for a stale or unknown clone", async () => {
    const port = new MemoryPort();
    port.localItems = [clone("clone-missing", "missing")];

    await new RouteContextMenuService(port).openRouteForLocalItem("clone-missing");

    expect(port.activatedTools).toEqual([]);
    expect(port.messages).toEqual(["Не удалось определить армию или корабль для маршрута."]);
  });
});
