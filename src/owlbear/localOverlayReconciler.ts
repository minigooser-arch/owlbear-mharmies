import type { SceneItemRecord, Vector2 } from "../shared/types";

export interface LocalOverlayBatchPort {
  getLocalItems(): Promise<SceneItemRecord[]>;
  addLocalItems(items: readonly SceneItemRecord[]): Promise<void>;
  updateLocalItems(items: readonly SceneItemRecord[]): Promise<void>;
  deleteLocalItems(ids: readonly string[]): Promise<void>;
  createId(): string;
}

export interface DesiredLocalOverlay {
  key: string;
  item: DesiredLocalOverlayItem;
}

export interface DesiredLocalOverlayItem {
  type: string;
  position: Vector2;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export type LocalOverlayKeyReader = (item: SceneItemRecord) => string | undefined;

function sameRenderedItem(
  existing: SceneItemRecord,
  desired: DesiredLocalOverlayItem
): boolean {
  return semanticSubsetEqual(existing, desired);
}

function semanticSubsetEqual(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => semanticSubsetEqual(actual[index], value));
  }
  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false;
    const actualRecord = actual as Record<string, unknown>;
    return Object.entries(expected).every(([key, value]) =>
      semanticSubsetEqual(actualRecord[key], value)
    );
  }
  return false;
}

function groupExistingItems(
  items: readonly SceneItemRecord[],
  existingKey: LocalOverlayKeyReader
): Map<string, SceneItemRecord[]> {
  const groups = new Map<string, SceneItemRecord[]>();
  for (const item of items) {
    const key = existingKey(item);
    if (key === undefined) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

export async function reconcileLocalOverlays(
  port: LocalOverlayBatchPort,
  existingKey: LocalOverlayKeyReader,
  desired: readonly DesiredLocalOverlay[]
): Promise<void> {
  const existingGroups = groupExistingItems(await port.getLocalItems(), existingKey);
  const existingByKey = new Map<string, SceneItemRecord>();
  const deletions: string[] = [];
  const desiredKeys = new Set(desired.map(({ key }) => key));
  for (const [key, group] of existingGroups) {
    group.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const [survivor, ...duplicates] = group;
    if (!desiredKeys.has(key)) {
      deletions.push(...group.map((item) => item.id));
    } else if (survivor) {
      existingByKey.set(key, survivor);
      deletions.push(...duplicates.map((item) => item.id));
    }
  }
  const additions = desired.flatMap(({ key, item }) => {
    const existing = existingByKey.get(key);
    if (existing && sameRenderedItem(existing, item)) return [];
    return existing ? [] : [{ ...structuredClone(item), id: port.createId() }];
  });
  const updates = desired.flatMap(({ key, item }) => {
    const existing = existingByKey.get(key);
    if (!existing || sameRenderedItem(existing, item)) return [];
    return [{ ...structuredClone(item), id: existing.id }];
  });
  if (additions.length > 0) await port.addLocalItems(additions);
  if (updates.length > 0) await port.updateLocalItems(updates);
  if (deletions.length > 0) await port.deleteLocalItems(deletions);
}

/**
 * Stateful variant for short-lived interactive tools. It scans all Owlbear
 * local items only on the first reconciliation, then keeps the IDs of the
 * overlays it owns and updates those directly for the rest of the session.
 */
export class LocalOverlayReconcileSession {
  private initialized = false;
  private existingByKey = new Map<string, SceneItemRecord>();

  constructor(
    private readonly port: LocalOverlayBatchPort,
    private readonly existingKey: LocalOverlayKeyReader
  ) {}

  invalidate(): void {
    this.initialized = false;
    this.existingByKey.clear();
  }

  async reconcile(desired: readonly DesiredLocalOverlay[]): Promise<void> {
    const desiredKeys = new Set(desired.map(({ key }) => key));
    const deletions: string[] = [];

    if (!this.initialized) {
      const groups = groupExistingItems(await this.port.getLocalItems(), this.existingKey);
      this.existingByKey.clear();
      for (const [key, group] of groups) {
        group.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
        const [survivor, ...duplicates] = group;
        if (!desiredKeys.has(key)) {
          deletions.push(...group.map((item) => item.id));
        } else if (survivor) {
          this.existingByKey.set(key, survivor);
          deletions.push(...duplicates.map((item) => item.id));
        }
      }
      this.initialized = true;
    } else {
      for (const [key, item] of this.existingByKey) {
        if (!desiredKeys.has(key)) deletions.push(item.id);
      }
    }

    const additions: SceneItemRecord[] = [];
    const updates: SceneItemRecord[] = [];
    const nextByKey = new Map<string, SceneItemRecord>();

    for (const { key, item } of desired) {
      const existing = this.existingByKey.get(key);
      if (!existing) {
        const addition = { ...structuredClone(item), id: this.port.createId() } as SceneItemRecord;
        additions.push(addition);
        nextByKey.set(key, addition);
        continue;
      }
      if (sameRenderedItem(existing, item)) {
        nextByKey.set(key, existing);
        continue;
      }
      const update = { ...structuredClone(item), id: existing.id } as SceneItemRecord;
      updates.push(update);
      nextByKey.set(key, update);
    }

    try {
      if (additions.length > 0) await this.port.addLocalItems(additions);
      if (updates.length > 0) await this.port.updateLocalItems(updates);
      if (deletions.length > 0) await this.port.deleteLocalItems(deletions);
      this.existingByKey = nextByKey;
    } catch (error) {
      this.invalidate();
      throw error;
    }
  }
}
