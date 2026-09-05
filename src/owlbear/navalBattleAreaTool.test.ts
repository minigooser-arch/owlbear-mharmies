import type { ToolMode } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import {
  NAVAL_BATTLE_AREA_REQUEST_ID_KEY,
  NAVAL_BATTLE_AREA_SESSION_ID_KEY
} from "../shared/constants";
import type { GridCellCoord } from "../shared/types";
import {
  registerNavalBattleAreaTool,
  type NavalBattleAreaToolApi
} from "./navalBattleAreaTool";

function event(x: number, y: number) {
  return { pointerPosition: { x, y } } as never;
}

function apiHarness() {
  let registeredMode: ToolMode | undefined;
  const created: string[] = [];
  const api: NavalBattleAreaToolApi = {
    create: async (tool) => { created.push(tool.id); },
    remove: async () => undefined,
    createMode: async (mode) => { registeredMode = mode; },
    removeMode: async () => undefined
  };
  return {
    api,
    created,
    get mode(): ToolMode {
      if (!registeredMode) throw new Error("Expected naval battle area mode to be registered");
      return registeredMode;
    }
  };
}

function portHarness(role: "GM" | "PLAYER") {
  const drafts: Array<{ requestId: string; cells: GridCellCoord[] }> = [];
  let preview: GridCellCoord[] = [];
  let clearCount = 0;
  return {
    port: {
      getRole: async () => role,
      getGridDpi: async () => 100,
      publishDraft: async (requestId: string, cells: readonly GridCellCoord[]) => {
        drafts.push({ requestId, cells: cells.map((cell) => ({ ...cell })) });
      },
      renderPreview: async (cells: readonly GridCellCoord[]) => {
        preview = cells.map((cell) => ({ ...cell }));
      },
      clearPreview: async () => {
        preview = [];
        clearCount += 1;
      },
      notify: async () => undefined
    },
    drafts,
    get preview() { return preview; },
    get clearCount() { return clearCount; }
  };
}

function context(requestId: string, sessionId: string) {
  return {
    metadata: {
      [NAVAL_BATTLE_AREA_REQUEST_ID_KEY]: requestId,
      [NAVAL_BATTLE_AREA_SESSION_ID_KEY]: sessionId
    }
  } as never;
}

describe("naval battle area selection tool", () => {
  it("does not register for players", async () => {
    const api = apiHarness();
    const port = portHarness("PLAYER");
    const registration = await registerNavalBattleAreaTool(api.api as never, port.port, "/icon.png");
    expect(registration.registered).toBe(false);
    expect(api.created).toEqual([]);
  });

  it("collects clicked cells and publishes a local draft", async () => {
    const api = apiHarness();
    const port = portHarness("GM");
    await registerNavalBattleAreaTool(api.api as never, port.port, "/icon.png");
    const ctx = context("request-1", "session-1");

    api.mode.onToolClick?.(ctx, event(50, 50));
    api.mode.onToolClick?.(ctx, event(150, 50));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(port.drafts.at(-1)).toEqual({
      requestId: "request-1",
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    });
    expect(port.preview).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });

  it("rasterizes drag selection and resets when a new session starts", async () => {
    const api = apiHarness();
    const port = portHarness("GM");
    await registerNavalBattleAreaTool(api.api as never, port.port, "/icon.png");

    const first = context("request-1", "session-1");
    api.mode.onToolDragStart?.(first, event(50, 50));
    api.mode.onToolDragMove?.(first, event(350, 50));
    api.mode.onToolDragEnd?.(first, event(350, 50));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port.drafts.at(-1)?.cells.map((cell) => cell.x)).toEqual([0, 1, 2, 3]);

    const second = context("request-2", "session-2");
    api.mode.onToolClick?.(second, event(250, 150));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(port.drafts.at(-1)).toEqual({
      requestId: "request-2",
      cells: [{ x: 2, y: 1 }]
    });
  });

  it("clears only the local preview when deactivated", async () => {
    const api = apiHarness();
    const port = portHarness("GM");
    await registerNavalBattleAreaTool(api.api as never, port.port, "/icon.png");
    const ctx = context("request-1", "session-1");

    api.mode.onToolClick?.(ctx, event(50, 50));
    await new Promise((resolve) => setTimeout(resolve, 0));
    api.mode.onDeactivate?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(port.preview).toEqual([]);
    expect(port.clearCount).toBeGreaterThan(0);
    expect(port.drafts.at(-1)?.cells).toEqual([{ x: 0, y: 0 }]);
  });
});
