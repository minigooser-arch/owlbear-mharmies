import { expect, it } from "vitest";
import type { Tool, ToolMode } from "@owlbear-rodeo/sdk";
import type { SceneItemRecord } from "../shared/types";
import { registerCellCoordinateTool, type CellCoordinateToolApi } from "./cellCoordinateTool";

it("shows hovered coordinates, pins a clicked cell, and clears both labels on exit", async () => {
  let mode: ToolMode | undefined;
  const tools = new Map<string, Tool>();
  let items: SceneItemRecord[] = [];
  const api: CellCoordinateToolApi = {
    create: async (tool) => { tools.set(tool.id, tool); },
    remove: async (id) => { tools.delete(id); },
    createMode: async (next) => { mode = next; },
    removeMode: async () => { mode = undefined; }
  };
  const port = {
    getGridDpi: async () => 100,
    createId: (() => { let next = 0; return () => `coordinate-${++next}`; })(),
    getLocalItems: async () => items,
    addLocalItem: async (item: SceneItemRecord) => { items.push(structuredClone(item)); },
    updateLocalItems: async (updates: readonly SceneItemRecord[]) => {
      const byId = new Map(updates.map((item) => [item.id, item]));
      items = items.map((item) => byId.get(item.id) ?? item);
    },
    deleteLocalItems: async (ids: readonly string[]) => { items = items.filter((item) => !ids.includes(item.id)); }
  };

  const registration = await registerCellCoordinateTool(api, port, "/coordinates.svg");
  const context = { metadata: {} } as never;
  mode?.onToolMove?.(context, { pointerPosition: { x: 250, y: 350 } } as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(items.some((item) => item.text === "X: 2, Y: 3")).toBe(true);

  mode?.onToolClick?.(context, { pointerPosition: { x: 250, y: 350 } } as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(items.some((item) => item.text === "Выбрано: 2, 3")).toBe(true);

  mode?.onToolMove?.(context, { pointerPosition: { x: 450, y: 150 } } as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(items.some((item) => item.text === "X: 4, Y: 1")).toBe(true);
  expect(items.some((item) => item.text === "Выбрано: 2, 3")).toBe(true);

  mode?.onDeactivate?.({} as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(items).toEqual([]);
  await registration();
});
