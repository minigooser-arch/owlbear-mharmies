import { METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord } from "../shared/types";

export type UpdateOrigin = "RECONCILIATION" | "INTERPOLATION";

export class UpdateOriginGuard {
  private readonly origins = new Map<string, Set<UpdateOrigin>>();

  isInternal(itemId: string): boolean {
    return (this.origins.get(itemId)?.size ?? 0) > 0;
  }

  async run<T>(itemId: string, origin: UpdateOrigin, operation: () => Promise<T>): Promise<T> {
    const origins = this.origins.get(itemId) ?? new Set<UpdateOrigin>();
    origins.add(origin);
    this.origins.set(itemId, origins);
    try {
      return await operation();
    } finally {
      origins.delete(origin);
      if (origins.size === 0) this.origins.delete(itemId);
    }
  }
}

export interface LocalClonePort {
  getLocalItems(): Promise<SceneItemRecord[]>;
  addLocalItem(item: SceneItemRecord): Promise<void>;
  updateLocalItem(id: string, update: ItemUpdate): Promise<void>;
  deleteLocalItems(ids: readonly string[]): Promise<void>;
  createClone(source: SceneItemRecord): SceneItemRecord;
}

function cloneSourceId(item: SceneItemRecord): string | undefined {
  const metadata = item.metadata[METADATA_KEYS.localClone];
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const sourceItemId = (metadata as Record<string, unknown>).sourceItemId;
  return typeof sourceItemId === "string" ? sourceItemId : undefined;
}

const RENDER_FIELDS = [
  "name",
  "description",
  "position",
  "rotation",
  "scale",
  "layer",
  "zIndex",
  "text",
  "image",
  "grid"
] as const;

function changedRenderFields(source: SceneItemRecord, clone: SceneItemRecord): ItemUpdate {
  const update: ItemUpdate = {};
  const indexedUpdate = update as Record<string, unknown>;
  for (const field of RENDER_FIELDS) {
    if (JSON.stringify(source[field]) !== JSON.stringify(clone[field])) {
      indexedUpdate[field] = source[field];
    }
  }
  if (clone.visible !== true) update.visible = true;
  return update;
}

export class LocalCloneReconciler {
  constructor(
    private readonly port: LocalClonePort,
    private readonly guard: UpdateOriginGuard
  ) {}

  async reconcile(
    visibleSourceIds: ReadonlySet<string>,
    sources: readonly SceneItemRecord[]
  ): Promise<void> {
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const clonesBySource = new Map<string, SceneItemRecord[]>();
    for (const item of await this.port.getLocalItems()) {
      const sourceItemId = cloneSourceId(item);
      if (!sourceItemId) continue;
      const clones = clonesBySource.get(sourceItemId) ?? [];
      clones.push(item);
      clonesBySource.set(sourceItemId, clones);
    }

    for (const [sourceItemId, clones] of clonesBySource) {
      if (!visibleSourceIds.has(sourceItemId) || !sourceById.has(sourceItemId)) {
        await this.port.deleteLocalItems(clones.map((clone) => clone.id));
      }
    }

    for (const sourceItemId of [...visibleSourceIds].sort()) {
      const source = sourceById.get(sourceItemId);
      if (!source) continue;
      const clones = (clonesBySource.get(sourceItemId) ?? []).sort((left, right) =>
        left.id.localeCompare(right.id)
      );
      let survivor = clones[0];
      if (!survivor) {
        const created = this.port.createClone(source);
        await this.guard.run(created.id, "RECONCILIATION", () => this.port.addLocalItem(created));
        survivor = created;
      }
      const survivorItem = survivor;
      const duplicates = clones.slice(1).map((clone) => clone.id);
      if (duplicates.length > 0) await this.port.deleteLocalItems(duplicates);
      const update = changedRenderFields(source, survivorItem);
      if (Object.keys(update).length > 0) {
        await this.guard.run(survivorItem.id, "RECONCILIATION", () =>
          this.port.updateLocalItem(survivorItem.id, update)
        );
      }
    }
  }
}
