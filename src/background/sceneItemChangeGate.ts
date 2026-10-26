import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { recordPerformance } from "../performance/metrics";
import {
  entityInteractionProxyMatchesSource,
  entityInteractionProxySourceId
} from "./entityInteractionProxy";

type ItemLike = Pick<SceneItemRecord, "id" | "type" | "metadata">;

/**
 * Owlbear sends the full list of scene items for each update.
 * This filter never hides ordinary items (including untagged ship images).
 * Generated proxies may only be ignored while they are intact.
 */
export class SceneItemChangeGate {
  private signature: string | undefined;
  private proxySourcesById = new Map<string, string>();
  private readonly pendingRepairs = new Set<string>();
  private readonly maxChars = 2_000_000;

  reset(): void {
    this.signature = undefined;
    this.proxySourcesById.clear();
    this.pendingRepairs.clear();
  }

  shouldRefresh<T extends ItemLike>(items: readonly T[]): boolean {
    let next: string;
    let nextProxySourcesById: Map<string, string>;
    let needsProxyRepair = false;
    try {
      const sourceById = new Map(items.map(item => [item.id, item]));
      const validProxySources = new Set<string>();
      const nextProxyIds = new Set<string>();
      nextProxySourcesById = new Map<string, string>();
      const tracked: T[] = [];
      for (const item of items) {
        const keys = Object.keys(item.metadata ?? {});
        if (keys.length === 1 && keys[0] === METADATA_KEYS.mapOverlay && item.type === "CURVE") {
          // Retired, generated shared map overlay: never part of game state.
          continue;
        }
        if (keys.length === 1 && keys[0] === METADATA_KEYS.entityInteractionProxy &&
            item.type === "SHAPE") {
          const sourceId = entityInteractionProxySourceId(item);
          const source = sourceId ? sourceById.get(sourceId) : undefined;
          if (source && sourceId && !validProxySources.has(sourceId) &&
              entityInteractionProxyMatchesSource(
                item as unknown as SceneItemRecord,
                source as unknown as SceneItemRecord
              )) {
            validProxySources.add(sourceId);
            nextProxyIds.add(item.id);
            nextProxySourcesById.set(item.id, sourceId);
            continue;
          }
          // Always retry reconciliation when a malformed/duplicate proxy remains.
          // A failed first repair must not become a permanent cosmetic-only skip.
          needsProxyRepair = true;
        }
        // A proxy with additional keys still needs normal reconciliation.
        if (item.metadata?.[METADATA_KEYS.entityInteractionProxy] !== undefined) {
          needsProxyRepair = true;
        }
        tracked.push(item);
      }
      next = JSON.stringify(tracked);
      if (next.length > this.maxChars) {
        this.reset();
        return true;
      }
      for (const [proxyId, sourceId] of this.proxySourcesById) {
        if (!nextProxyIds.has(proxyId) && sourceById.has(sourceId)) {
          this.pendingRepairs.add(sourceId);
        }
      }
      for (const sourceId of this.pendingRepairs) {
        if (validProxySources.has(sourceId) || !sourceById.has(sourceId)) {
          this.pendingRepairs.delete(sourceId);
        }
      }
    } catch {
      // SDK data unexpectedly changed shape: fail open.
      this.reset();
      return true;
    }

    const changed = this.signature === undefined ||
      this.signature !== next || needsProxyRepair || this.pendingRepairs.size > 0;
    this.signature = next;
    this.proxySourcesById = nextProxySourcesById;
    if (!changed) recordPerformance("scene.items.cosmeticOnlySkipped", 0);
    return changed;
  }
}
