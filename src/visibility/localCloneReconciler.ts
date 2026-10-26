import { METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord } from "../shared/types";

export type UpdateOrigin = "RECONCILIATION" | "INTERPOLATION";

export class UpdateOriginGuard {
  // Count references rather than using a Set so overlapping reconciliation work
  // cannot prematurely clear an origin owned by another asynchronous operation.
  private readonly origins = new Map<string, Map<UpdateOrigin, number>>();

  isInternal(itemId: string): boolean {
    return this.origins.has(itemId);
  }

  async run<T>(itemId: string, origin: UpdateOrigin, operation: () => Promise<T>): Promise<T> {
    return this.runMany([itemId], origin, operation);
  }

  async runMany<T>(
    itemIds: readonly string[],
    origin: UpdateOrigin,
    operation: () => Promise<T>
  ): Promise<T> {
    const ids = [...new Set(itemIds)];
    for (const id of ids) {
      const counts = this.origins.get(id) ?? new Map<UpdateOrigin, number>();
      counts.set(origin, (counts.get(origin) ?? 0) + 1);
      this.origins.set(id, counts);
    }
    try {
      return await operation();
    } finally {
      for (const id of ids) {
        const counts = this.origins.get(id);
        if (!counts) continue;
        const remaining = (counts.get(origin) ?? 1) - 1;
        if (remaining > 0) counts.set(origin, remaining);
        else counts.delete(origin);
        if (counts.size === 0) this.origins.delete(id);
      }
    }
  }
}

export interface LocalClonePatch { id: string; update: ItemUpdate; }

export interface LocalClonePort {
  getLocalItems(): Promise<SceneItemRecord[]>;
  addLocalItem(item: SceneItemRecord): Promise<void>;
  addLocalItems?(items: readonly SceneItemRecord[]): Promise<void>;
  updateLocalItem(id: string, update: ItemUpdate): Promise<void>;
  updateLocalItemPatches?(patches: readonly LocalClonePatch[]): Promise<void>;
  deleteLocalItems(ids: readonly string[]): Promise<void>;
  createClone(source: SceneItemRecord): SceneItemRecord;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function cloneSourceId(item: SceneItemRecord): string | undefined {
  const metadata = objectRecord(item.metadata[METADATA_KEYS.localClone]);
  const sourceItemId = metadata?.sourceItemId;
  return typeof sourceItemId === "string" ? sourceItemId : undefined;
}

function validShipFacing(value: unknown): boolean {
  return value === "NORTH" || value === "EAST" || value === "SOUTH" || value === "WEST";
}

function sourceHasRoute(source: SceneItemRecord): boolean {
  const ship = objectRecord(source.metadata[METADATA_KEYS.ship]);
  if (ship) {
    return (Array.isArray(ship.plannedRoute) && ship.plannedRoute.length > 0) ||
      validShipFacing(ship.plannedFacing);
  }
  const army = objectRecord(source.metadata[METADATA_KEYS.army]);
  const plannedRoute = objectRecord(army?.plannedRoute);
  return Array.isArray(plannedRoute?.cells) && plannedRoute.cells.length > 0;
}

export interface LocalCloneViewer {
  isGM: boolean;
  leaderSideIds: ReadonlySet<string>;
}

export function localCloneMetadataForSource(
  source: SceneItemRecord,
  viewer: LocalCloneViewer = { isGM: false, leaderSideIds: new Set() }
): Record<string, unknown> {
  const army = objectRecord(source.metadata[METADATA_KEYS.army]);
  const sideId = typeof army?.sideId === "string" ? army.sideId : undefined;
  return {
    sourceItemId: source.id,
    hasRoute: sourceHasRoute(source),
    canEditRoute: viewer.isGM || (sideId !== undefined && viewer.leaderSideIds.has(sideId))
  };
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
  "textItemType",
  "image",
  "grid"
] as const;

function changedRenderFields(source: SceneItemRecord, clone: SceneItemRecord, viewer: LocalCloneViewer): ItemUpdate {
  const update: ItemUpdate = {};
  const indexedUpdate = update as Record<string, unknown>;
  for (const field of RENDER_FIELDS) {
    if (JSON.stringify(source[field]) !== JSON.stringify(clone[field])) {
      indexedUpdate[field] = source[field];
    }
  }
  if (clone.visible !== true) update.visible = true;
  if (clone.locked !== false) update.locked = false;
  if (clone.disableHit !== false) update.disableHit = false;
  const desiredCloneMetadata = localCloneMetadataForSource(source, viewer);
  if (JSON.stringify(clone.metadata[METADATA_KEYS.localClone]) !== JSON.stringify(desiredCloneMetadata)) {
    update.metadata = {
      ...clone.metadata,
      [METADATA_KEYS.localClone]: desiredCloneMetadata
    };
  }
  return update;
}

export class LocalCloneReconciler {
  constructor(
    private readonly port: LocalClonePort,
    private readonly guard: UpdateOriginGuard
  ) {}

  async reconcile(
    visibleSourceIds: ReadonlySet<string>,
    sources: readonly SceneItemRecord[],
    viewer: LocalCloneViewer = { isGM: false, leaderSideIds: new Set() },
    localItemSnapshot?: readonly SceneItemRecord[]
  ): Promise<void> {
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const clonesBySource = new Map<string, SceneItemRecord[]>();
    for (const item of localItemSnapshot ?? await this.port.getLocalItems()) {
      const sourceItemId = cloneSourceId(item);
      if (!sourceItemId) continue;
      const clones = clonesBySource.get(sourceItemId) ?? [];
      clones.push(item);
      clonesBySource.set(sourceItemId, clones);
    }

    // Decide all changes from the same local snapshot, then send bounded SDK
    // batches. Process removals first to prevent stale hidden units lingering.
    const deletions: string[] = [];
    const additions: SceneItemRecord[] = [];
    const patches: LocalClonePatch[] = [];
    const desiredSourceIds = [...visibleSourceIds].filter(id => sourceById.has(id)).sort();
    const desired = new Set(desiredSourceIds);

    for (const [sourceItemId, clones] of clonesBySource) {
      clones.sort((left, right) => left.id.localeCompare(right.id));
      if (!desired.has(sourceItemId)) {
        deletions.push(...clones.map((clone) => clone.id));
      } else {
        deletions.push(...clones.slice(1).map((clone) => clone.id));
      }
    }

    for (const sourceItemId of desiredSourceIds) {
      const source = sourceById.get(sourceItemId);
      if (!source) continue;
      const survivor = clonesBySource.get(sourceItemId)?.[0];
      if (!survivor) {
        const created = this.port.createClone(source);
        // Newly created clones must have correct permissions and route state
        // immediately; do not add an unprivileged clone and patch it later.
        Object.assign(created, changedRenderFields(source, created, viewer));
        additions.push(created);
      } else {
        const update = changedRenderFields(source, survivor, viewer);
        if (Object.keys(update).length > 0) {
          patches.push({ id: survivor.id, update });
        }
      }
    }

    if (deletions.length) await this.port.deleteLocalItems(deletions);
    if (additions.length) {
      await this.guard.runMany(additions.map(item => item.id), "RECONCILIATION", async () => {
        if (this.port.addLocalItems) await this.port.addLocalItems(additions);
        else for (const item of additions) await this.port.addLocalItem(item);
      });
    }
    if (patches.length) {
      await this.guard.runMany(patches.map(patch => patch.id), "RECONCILIATION", async () => {
        if (this.port.updateLocalItemPatches) await this.port.updateLocalItemPatches(patches);
        else for (const patch of patches) await this.port.updateLocalItem(patch.id, patch.update);
      });
    }
  }
}
