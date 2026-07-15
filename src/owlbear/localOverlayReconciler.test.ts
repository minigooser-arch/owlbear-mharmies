import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "./localOverlayReconciler";

class MemoryOverlayPort implements LocalOverlayBatchPort {
  items: SceneItemRecord[] = [];
  operations: string[] = [];
  nextId = 0;

  async getLocalItems() { return structuredClone(this.items); }
  async addLocalItems(items: readonly SceneItemRecord[]) {
    this.operations.push(`add:${items.map((item) => item.id).join(",")}`);
    this.items.push(...structuredClone(items));
  }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    this.operations.push(`update:${items.map((item) => item.id).join(",")}`);
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) {
    this.operations.push(`delete:${ids.join(",")}`);
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
  createId() { this.nextId += 1; return `local-${this.nextId}`; }
}

function desired(key: string, x = 1): DesiredLocalOverlay {
  return {
    key,
    item: {
      type: "CURVE",
      position: { x: 0, y: 0 },
      visible: true,
      disableHit: true,
      metadata: { "test/overlay": { key } },
      points: [{ x: 0, y: 0 }, { x, y: 0 }],
      strokeColor: "#0f0"
    }
  };
}

function overlayKey(item: SceneItemRecord): string | undefined {
  const metadata = item.metadata["test/overlay"];
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const key = (metadata as Record<string, unknown>).key;
  return typeof key === "string" ? key : undefined;
}

it("adds the first desired overlays in one batch", async () => {
  const port = new MemoryOverlayPort();

  await reconcileLocalOverlays(port, overlayKey, [desired("line"), desired("label")]);

  expect(port.items.map((item) => item.id)).toEqual(["local-1", "local-2"]);
  expect(port.operations).toEqual(["add:local-1,local-2"]);
});

it("does not write when the rendered overlays are unchanged", async () => {
  const port = new MemoryOverlayPort();
  await reconcileLocalOverlays(port, overlayKey, [desired("line")]);
  port.operations = [];

  await reconcileLocalOverlays(port, overlayKey, [desired("line")]);

  expect(port.operations).toEqual([]);
  expect(port.items.map((item) => item.id)).toEqual(["local-1"]);
});

it("updates a changed overlay in one batch while preserving its ID", async () => {
  const port = new MemoryOverlayPort();
  await reconcileLocalOverlays(port, overlayKey, [desired("line", 1)]);
  port.operations = [];

  await reconcileLocalOverlays(port, overlayKey, [desired("line", 3)]);

  expect(port.operations).toEqual(["update:local-1"]);
  expect(port.items).toMatchObject([{ id: "local-1", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }]);
});

it("adds and updates before deleting stale overlays", async () => {
  const port = new MemoryOverlayPort();
  port.items = [
    { ...desired("line", 1).item, id: "line-existing" },
    { ...desired("stale", 1).item, id: "stale-existing" }
  ];

  await reconcileLocalOverlays(port, overlayKey, [desired("line", 3), desired("label")]);

  expect(port.operations).toEqual([
    "add:local-1",
    "update:line-existing",
    "delete:stale-existing"
  ]);
});

it("keeps one stable survivor and deletes duplicate semantic keys", async () => {
  const port = new MemoryOverlayPort();
  port.items = [
    { ...desired("line").item, id: "line-b" },
    { ...desired("line").item, id: "line-a" }
  ];

  await reconcileLocalOverlays(port, overlayKey, [desired("line")]);

  expect(port.items.map((item) => item.id)).toEqual(["line-a"]);
  expect(port.operations).toEqual(["delete:line-b"]);
});

it("ignores unrelated SDK fields and metadata when comparing rendered fields", async () => {
  const port = new MemoryOverlayPort();
  port.items = [{
    ...desired("line").item,
    id: "line-existing",
    layer: "POINTER",
    style: { strokeWidth: 4 },
    metadata: {
      unrelated: { keep: true },
      "test/overlay": { key: "line" }
    }
  }];

  await reconcileLocalOverlays(port, overlayKey, [desired("line")]);

  expect(port.operations).toEqual([]);
  expect(port.items[0]?.metadata.unrelated).toEqual({ keep: true });
});
