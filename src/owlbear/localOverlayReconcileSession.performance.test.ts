import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import {
  LocalOverlayReconcileSession,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "./localOverlayReconciler";

class CountingOverlayPort implements LocalOverlayBatchPort {
  items: SceneItemRecord[] = [];
  getCalls = 0;
  nextId = 0;

  async getLocalItems() {
    this.getCalls += 1;
    return structuredClone(this.items);
  }

  async addLocalItems(items: readonly SceneItemRecord[]) {
    this.items.push(...structuredClone(items));
  }

  async updateLocalItems(items: readonly SceneItemRecord[]) {
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }

  async deleteLocalItems(ids: readonly string[]) {
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }

  createId() {
    this.nextId += 1;
    return `overlay-${this.nextId}`;
  }
}

function desired(x: number): DesiredLocalOverlay {
  return {
    key: "route/line",
    item: {
      type: "CURVE",
      position: { x: 0, y: 0 },
      points: [{ x: 0, y: 0 }, { x, y: 0 }],
      metadata: { "test/route": "line" }
    }
  };
}

function key(item: SceneItemRecord): string | undefined {
  return item.metadata["test/route"] === "line" ? "route/line" : undefined;
}

it("scans local Owlbear items only once while repeatedly updating one route-preview session", async () => {
  const port = new CountingOverlayPort();
  const session = new LocalOverlayReconcileSession(port, key);

  await session.reconcile([desired(1)]);
  await session.reconcile([desired(2)]);
  await session.reconcile([desired(3)]);
  await session.reconcile([desired(4)]);

  expect(port.getCalls).toBe(1);
  expect(port.items).toMatchObject([{ id: "overlay-1", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] }]);
});
