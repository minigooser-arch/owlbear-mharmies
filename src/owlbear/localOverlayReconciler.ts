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

export async function reconcileLocalOverlays(
  port: LocalOverlayBatchPort,
  existingKey: LocalOverlayKeyReader,
  desired: readonly DesiredLocalOverlay[]
): Promise<void> {
  const existingGroups = new Map<string, SceneItemRecord[]>();
  for (const item of await port.getLocalItems()) {
    const key = existingKey(item);
    if (key === undefined) continue;
    const group = existingGroups.get(key) ?? [];
    group.push(item);
    existingGroups.set(key, group);
  }
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
