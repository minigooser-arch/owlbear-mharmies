import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord } from "../shared/types";
import {
  LocalCloneReconciler,
  UpdateOriginGuard,
  type LocalClonePort
} from "./localCloneReconciler";

class MemoryClonePort implements LocalClonePort {
  localItems: SceneItemRecord[] = [];

  async getLocalItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.localItems);
  }

  async addLocalItem(item: SceneItemRecord): Promise<void> {
    this.localItems.push(structuredClone(item));
  }

  async updateLocalItem(id: string, update: ItemUpdate): Promise<void> {
    const item = this.localItems.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, structuredClone(update));
  }

  async deleteLocalItems(ids: readonly string[]): Promise<void> {
    this.localItems = this.localItems.filter((item) => !ids.includes(item.id));
  }

  createClone(source: SceneItemRecord): SceneItemRecord {
    return {
      ...structuredClone(source),
      id: `new-${source.id}`,
      visible: true,
      metadata: {
        ...source.metadata,
        [METADATA_KEYS.localClone]: { sourceItemId: source.id }
      }
    };
  }
}

function source(): SceneItemRecord {
  return {
    id: "source-a",
    type: "IMAGE",
    name: "Армия",
    position: { x: 20, y: 10 },
    rotation: 15,
    scale: { x: 2, y: 2 },
    layer: "CHARACTER",
    zIndex: 3,
    metadata: {}
  };
}

function clone(id: string): SceneItemRecord {
  return {
    ...source(),
    id,
    position: { x: 0, y: 0 },
    metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "source-a" } }
  };
}

describe("LocalCloneReconciler", () => {
  it("creates one survivor, updates it, and removes deterministic duplicates", async () => {
    const port = new MemoryClonePort();
    port.localItems.push(clone("clone-b"), clone("clone-a"));
    const reconciler = new LocalCloneReconciler(port, new UpdateOriginGuard());
    await reconciler.reconcile(new Set(["source-a"]), [source()]);

    expect(port.localItems).toHaveLength(1);
    expect(port.localItems[0]?.id).toBe("clone-a");
    expect(port.localItems[0]?.position).toEqual({ x: 20, y: 10 });
  });

  it("removes a clone after the source becomes hidden", async () => {
    const port = new MemoryClonePort();
    port.localItems.push(clone("clone-a"));
    await new LocalCloneReconciler(port, new UpdateOriginGuard()).reconcile(new Set(), [source()]);
    expect(port.localItems).toEqual([]);
  });

  it("marks reconciliation writes as internal only while they run", async () => {
    const guard = new UpdateOriginGuard();
    expect(guard.isInternal("clone-a")).toBe(false);
    await guard.run("clone-a", "RECONCILIATION", async () => {
      expect(guard.isInternal("clone-a")).toBe(true);
    });
    expect(guard.isInternal("clone-a")).toBe(false);
  });
});
