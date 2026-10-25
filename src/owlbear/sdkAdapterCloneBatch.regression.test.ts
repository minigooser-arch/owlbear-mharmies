// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createOwlbearAdapter } from "./sdkAdapter";
import type { ItemUpdate, SceneItemRecord } from "../shared/types";

function createFixture() {
  const items: SceneItemRecord[] = [
    { id: "a", type: "IMAGE", name: "First", position: { x: 0, y: 0 }, metadata: { keep: 1 } },
    { id: "b", type: "IMAGE", name: "Second", position: { x: 0, y: 0 }, metadata: { keep: 2 } }
  ];
  const getItems = vi.fn(async () => structuredClone(items));
  const updateItems = vi.fn(async (
    ids: unknown[],
    mutate: (drafts: SceneItemRecord[]) => void
  ) => {
    const drafts = items.filter(item => ids.includes(item.id)).map(item => structuredClone(item));
    mutate(drafts);
    for (const draft of drafts) {
      const position = items.findIndex(item => item.id === draft.id);
      if (position >= 0) items[position] = draft;
    }
  });
  const collection = {
    getItems,
    updateItems,
    addItems: async () => undefined,
    deleteItems: async () => undefined
  };
  const sdk = {
    scene: {
      getMetadata: async () => ({}),
      setMetadata: async () => undefined,
      items: collection,
      local: collection,
      grid: {
        getDistance: async () => 0,
        getDpi: async () => 100,
        snapPosition: async (position: { x: number; y: number }) => position,
        onChange: () => () => undefined
      }
    },
    broadcast: {
      sendMessage: async () => undefined,
      onMessage: () => () => undefined
    },
    notification: { show: async () => undefined }
  };
  return { items, getItems, updateItems, adapter: createOwlbearAdapter(sdk) };
}

describe("batched local clone SDK patches", () => {
  it("updates only changed clone fields in one call without another full read", async () => {
    const fixture = createFixture();
    const patches: Array<{ id: string; update: ItemUpdate }> = [
      { id: "a", update: { position: { x: 20, y: 30 } } },
      { id: "b", update: { name: "Renamed", locked: false } }
    ];

    await fixture.adapter.updateLocalItemPatches?.(patches);

    expect(fixture.getItems).not.toHaveBeenCalled();
    expect(fixture.updateItems).toHaveBeenCalledTimes(1);
    expect(fixture.updateItems.mock.calls[0]?.[0]).toEqual(["a", "b"]);
    expect(fixture.items[0]).toMatchObject({
      position: { x: 20, y: 30 }, name: "First", metadata: { keep: 1 }
    });
    expect(fixture.items[1]).toMatchObject({
      position: { x: 0, y: 0 }, name: "Renamed", locked: false, metadata: { keep: 2 }
    });
  });

  it("requests only touched local IDs when normalizing an overlay batch", async () => {
    const fixture = createFixture();
    await fixture.adapter.updateLocalItems([{
      id: "a",
      type: "IMAGE",
      position: { x: 99, y: 10 },
      metadata: { keep: 1 }
    }]);

    expect(fixture.getItems).toHaveBeenCalledTimes(1);
    expect(fixture.getItems).toHaveBeenCalledWith(["a"]);
    expect(fixture.updateItems).toHaveBeenCalledTimes(1);
    expect(fixture.items[0]?.position).toEqual({ x: 99, y: 10 });
    expect(fixture.items[1]?.position).toEqual({ x: 0, y: 0 });
  });

  it("updates multiple shared interaction proxies without scanning the scene", async () => {
    const fixture = createFixture();
    await fixture.adapter.updateSceneItemPatches?.([
      { id: "a", update: { position: { x: 12, y: 24 }, layer: "CHARACTER" } },
      { id: "b", update: { position: { x: 35, y: 50 }, visible: true } }
    ]);

    expect(fixture.getItems).not.toHaveBeenCalled();
    expect(fixture.updateItems).toHaveBeenCalledTimes(1);
    expect(fixture.updateItems).toHaveBeenCalledWith(
      ["a", "b"], expect.any(Function)
    );
    expect(fixture.items[0]).toMatchObject({
      name: "First", position: { x: 12, y: 24 }, layer: "CHARACTER",
      metadata: { keep: 1 }
    });
    expect(fixture.items[1]).toMatchObject({
      name: "Second", position: { x: 35, y: 50 }, visible: true,
      metadata: { keep: 2 }
    });
  });

  it("fetches a single scene source by ID, including a missing ID", async () => {
    const fixture = createFixture();
    await expect(fixture.adapter.getSceneItem?.("a")).resolves.toMatchObject({
      id: "a", name: "First"
    });
    await expect(fixture.adapter.getSceneItem?.("missing")).resolves.toBeUndefined();
    expect(fixture.getItems).toHaveBeenNthCalledWith(1, ["a"]);
    expect(fixture.getItems).toHaveBeenNthCalledWith(2, ["missing"]);
    expect(fixture.getItems).toHaveBeenCalledTimes(2);
  });

  it("rejects ambiguous duplicate patches before making SDK calls", async () => {
    const fixture = createFixture();
    await expect(fixture.adapter.updateLocalItemPatches?.([
      { id: "a", update: { visible: true } },
      { id: "a", update: { visible: false } }
    ])).rejects.toThrow("Duplicate local clone patch ID");
    expect(fixture.updateItems).not.toHaveBeenCalled();
  });
});
