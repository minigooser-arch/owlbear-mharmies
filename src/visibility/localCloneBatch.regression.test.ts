import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord } from "../shared/types";
import {
  LocalCloneReconciler,
  UpdateOriginGuard,
  type LocalClonePatch,
  type LocalClonePort
} from "./localCloneReconciler";

function source(id: string, x = 0): SceneItemRecord {
  return {
    id, type: "IMAGE", position: { x, y: 10 }, name: id,
    metadata: {
      [METADATA_KEYS.army]: {
        sideId: "red", plannedRoute: { cells: [{ x: 1, y: 0 }] }
      }
    }
  };
}

class BatchPort implements LocalClonePort {
  localItems: SceneItemRecord[] = [];
  readonly addBatches: SceneItemRecord[][] = [];
  readonly patchBatches: LocalClonePatch[][] = [];
  readonly deleteBatches: string[][] = [];
  readonly guard = new UpdateOriginGuard();
  failUpdate = false;

  async getLocalItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.localItems);
  }

  async addLocalItem(item: SceneItemRecord): Promise<void> {
    throw new Error(`Unbatched creation: ${item.id}`);
  }

  async updateLocalItem(id: string, update: ItemUpdate): Promise<void> {
    throw new Error(`Unbatched update: ${id} ${JSON.stringify(update)}`);
  }

  async addLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    for (const item of items) expect(this.guard.isInternal(item.id)).toBe(true);
    this.addBatches.push(structuredClone([...items]));
    this.localItems.push(...structuredClone([...items]));
  }

  async updateLocalItemPatches(patches: readonly LocalClonePatch[]): Promise<void> {
    for (const patch of patches) expect(this.guard.isInternal(patch.id)).toBe(true);
    this.patchBatches.push(structuredClone([...patches]));
    if (this.failUpdate) throw new Error("SDK update failed");
    for (const { id, update } of patches) {
      const target = this.localItems.find(item => item.id === id);
      if (target) Object.assign(target, structuredClone(update));
    }
  }

  async deleteLocalItems(ids: readonly string[]): Promise<void> {
    this.deleteBatches.push([...ids]);
    this.localItems = this.localItems.filter(item => !ids.includes(item.id));
  }

  createClone(item: SceneItemRecord): SceneItemRecord {
    return {
      ...structuredClone(item),
      id: `local-${item.id}`,
      visible: true,
      locked: true,
      disableHit: true,
      metadata: { [METADATA_KEYS.localClone]: { sourceItemId: item.id } }
    };
  }
}

describe("batched local clone reconciliation", () => {
  it("creates visible units in one batch with correct permissions from the outset", async () => {
    const port = new BatchPort();
    const originals = Array.from({ length: 30 }, (_, index) => source(`army-${index}`));
    await new LocalCloneReconciler(port, port.guard).reconcile(
      new Set(originals.map(item => item.id)),
      originals,
      { isGM: false, leaderSideIds: new Set(["red"]) }
    );

    expect(port.addBatches).toHaveLength(1);
    expect(port.addBatches[0]).toHaveLength(30);
    expect(port.patchBatches).toHaveLength(0);
    for (const item of port.localItems) {
      expect(item).toMatchObject({
        visible: true, locked: false, disableHit: false,
        metadata: { [METADATA_KEYS.localClone]: { hasRoute: true, canEditRoute: true } }
      });
      expect(port.guard.isInternal(item.id)).toBe(false);
    }
  });

  it("removes hidden and duplicate clones first, then updates only changed survivors", async () => {
    const port = new BatchPort();
    const originals = [source("army-1", 30), source("army-2", 20)];
    await new LocalCloneReconciler(port, port.guard).reconcile(
      new Set(originals.map(x => x.id)), originals
    );
    port.addBatches.length = 0;
    port.localItems.push({
      ...structuredClone(port.localItems[0] ?? source("army-1")),
      id: "local-army-1-z"
    });
    port.localItems.push({
      ...structuredClone(port.localItems[0] ?? source("army-1")),
      id: "local-hidden",
      metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "hidden" } }
    });

    await new LocalCloneReconciler(port, port.guard).reconcile(
      new Set(["army-1"]), [source("army-1", 90), source("army-2", 20)]
    );

    expect(port.deleteBatches).toHaveLength(1);
    expect(new Set(port.deleteBatches[0])).toEqual(
      new Set(["local-army-1-z", "local-army-2", "local-hidden"])
    );
    expect(port.patchBatches).toHaveLength(1);
    expect(port.patchBatches[0]).toHaveLength(1);
    expect(port.patchBatches[0]?.[0]?.update.position).toEqual({ x: 90, y: 10 });
    expect(port.localItems).toHaveLength(1);
    expect(port.localItems[0]?.id).toBe("local-army-1");

    await new LocalCloneReconciler(port, port.guard).reconcile(
      new Set(["army-1"]), [source("army-1", 90)]
    );
    expect(port.patchBatches).toHaveLength(1);
    expect(port.addBatches).toHaveLength(0);
  });

  it("clears all update guards if a batch fails", async () => {
    const port = new BatchPort();
    const originals = [source("army-a", 0), source("army-b", 0)];
    await new LocalCloneReconciler(port, port.guard).reconcile(
      new Set(originals.map(item => item.id)), originals
    );
    port.failUpdate = true;
    await expect(new LocalCloneReconciler(port, port.guard).reconcile(
      new Set(originals.map(item => item.id)),
      [source("army-a", 100), source("army-b", 100)]
    )).rejects.toThrow("SDK update failed");
    expect(port.guard.isInternal("local-army-a")).toBe(false);
    expect(port.guard.isInternal("local-army-b")).toBe(false);
  });

  it("preserves the internal marker across overlapping tasks for the same clone", async () => {
    const guard = new UpdateOriginGuard();
    let releaseFirst: (() => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    const first = guard.runMany(["a", "b"], "RECONCILIATION", () =>
      new Promise<void>(resolve => { releaseFirst = resolve; })
    );
    const second = guard.run("a", "RECONCILIATION", () =>
      new Promise<void>(resolve => { releaseSecond = resolve; })
    );
    expect(guard.isInternal("a")).toBe(true);
    expect(guard.isInternal("b")).toBe(true);
    releaseFirst?.();
    await first;
    expect(guard.isInternal("a")).toBe(true);
    expect(guard.isInternal("b")).toBe(false);
    releaseSecond?.();
    await second;
    expect(guard.isInternal("a")).toBe(false);
  });
});
