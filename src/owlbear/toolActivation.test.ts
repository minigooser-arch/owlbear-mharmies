import { expect, it } from "vitest";
import { activateToolMode, waitForToolActivation } from "./toolActivation";

it("waits for the tool to become active before activating its mode", async () => {
  const routeTool = "com.letopis.army-control/route-tool";
  const routeMode = `${routeTool}/draw`;
  let activeTool = "rodeo.owlbear.tool/move";
  let activeMode: string | undefined = "rodeo.owlbear.tool-mode/move";
  const port = {
    getActiveTool: async () => activeTool,
    getActiveToolMode: async () => activeMode,
    activateTool: async (toolId: string) => {
      setTimeout(() => {
        activeTool = toolId;
        activeMode = "rodeo.owlbear.tool-mode/move";
      }, 40);
    },
    activateMode: async (toolId: string, modeId: string) => {
      if (activeTool === toolId) activeMode = modeId;
    }
  };

  await expect(activateToolMode(port, routeTool, routeMode, 300, 5)).resolves.toEqual({
    toolId: routeTool,
    modeId: routeMode
  });
});

it("waits for Owlbear's active tool state to catch up after activation calls resolve", async () => {
  let activeTool = "rodeo.owlbear.tool/move";
  let activeMode: string | undefined = "rodeo.owlbear.tool-mode/move";
  const port = {
    getActiveTool: async () => activeTool,
    getActiveToolMode: async () => activeMode
  };

  setTimeout(() => {
    activeTool = "com.letopis.army-control/route-tool";
    activeMode = "com.letopis.army-control/route-tool/draw";
  }, 60);

  await expect(waitForToolActivation(
    port,
    "com.letopis.army-control/route-tool",
    "com.letopis.army-control/route-tool/draw",
    300,
    10
  )).resolves.toEqual({
    toolId: "com.letopis.army-control/route-tool",
    modeId: "com.letopis.army-control/route-tool/draw"
  });
});

it("returns the latest active tool state after the timeout", async () => {
  const state = await waitForToolActivation({
    getActiveTool: async () => "rodeo.owlbear.tool/move",
    getActiveToolMode: async () => "rodeo.owlbear.tool-mode/move"
  }, "route-tool", "route-mode", 20, 5);

  expect(state).toEqual({
    toolId: "rodeo.owlbear.tool/move",
    modeId: "rodeo.owlbear.tool-mode/move"
  });
});
