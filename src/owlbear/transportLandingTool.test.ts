import type { ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  TRANSPORT_LANDING_ARMY_ID_KEY,
  TRANSPORT_LANDING_RETURN_TOOL_KEY,
  TRANSPORT_LANDING_SHIP_ID_KEY
} from "../shared/constants";
import { registerTransportLandingTool, type TransportLandingToolApi } from "./transportLandingTool";

function event(x: number, y: number) {
  return { pointerPosition: { x, y } } as never;
}

function context(shipId = "transport", armyId = "army", returnToolId = "select") {
  return {
    metadata: {
      [TRANSPORT_LANDING_SHIP_ID_KEY]: shipId,
      [TRANSPORT_LANDING_ARMY_ID_KEY]: armyId,
      [TRANSPORT_LANDING_RETURN_TOOL_KEY]: returnToolId
    }
  } as never;
}

function apiHarness() {
  let mode: ToolMode | undefined;
  const metadataUpdates: unknown[] = [];
  const api: TransportLandingToolApi = {
    create: async () => undefined,
    remove: async () => undefined,
    createMode: async (value) => { mode = value; },
    removeMode: async () => undefined,
    setMetadata: async (_toolId, update) => { metadataUpdates.push(update); }
  };
  return {
    api,
    metadataUpdates,
    get mode() {
      if (!mode) throw new Error("Expected landing tool mode");
      return mode;
    }
  };
}

describe("transport landing tool", () => {
  it("commits the clicked strategic cell and restores the previous tool", async () => {
    const harness = apiHarness();
    const commitLanding = vi.fn(async () => undefined);
    const restoreTool = vi.fn(async () => undefined);
    const notify = vi.fn(async () => undefined);

    await registerTransportLandingTool(harness.api, {
      getGridDpi: async () => 100,
      commitLanding,
      restoreTool,
      notify
    }, "/icon.png");

    harness.mode.onToolClick?.(context(), event(150, 50));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(commitLanding).toHaveBeenCalledWith("transport", "army", { x: 1, y: 0 });
    expect(restoreTool).toHaveBeenCalledWith("select");
    expect(harness.metadataUpdates.at(-1)).toMatchObject({
      [TRANSPORT_LANDING_SHIP_ID_KEY]: null,
      [TRANSPORT_LANDING_ARMY_ID_KEY]: null,
      [TRANSPORT_LANDING_RETURN_TOOL_KEY]: null
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps the tool active after a rejected landing cell", async () => {
    const harness = apiHarness();
    const commitLanding = vi.fn(async () => { throw new Error("LANDING_REQUIRES_LAND"); });
    const restoreTool = vi.fn(async () => undefined);
    const notify = vi.fn(async () => undefined);

    await registerTransportLandingTool(harness.api, {
      getGridDpi: async () => 100,
      commitLanding,
      restoreTool,
      notify
    }, "/icon.png");

    harness.mode.onToolClick?.(context(), event(50, 50));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(restoreTool).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("LANDING_REQUIRES_LAND"), "WARNING");
  });
});
