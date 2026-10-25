import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { recordPerformance } from "../performance/metrics";

/**
 * Only known generated scene cosmetics may be ignored. Ordinary images are
 * never ignored: a ship may be represented solely by its ID in scene metadata,
 * without a ship metadata key on the item.
 */
function isGeneratedCosmetic(item: Pick<SceneItemRecord, "type" | "metadata">): boolean {
  const metadata = item.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const keys = Object.keys(metadata);
  if (keys.length !== 1) return false;
  if (keys[0] === METADATA_KEYS.entityInteractionProxy) {
    return item.type === "SHAPE";
  }
  if (keys[0] === METADATA_KEYS.mapOverlay) {
    return item.type === "CURVE";
  }
  return false;
}

/**
 * Owlbear emits the entire updated scene item collection on each onChange.
 * This is an event filter, NOT a cached authoritative scene snapshot.
 *
 * The first event and every scene change are always forwarded. Subsequent
 * events differing only in generated cosmetic proxies/legacy map overlays
 * may be skipped. On any unexpected data or oversized scene, fail open and
 * request a complete refresh.
 */
export class SceneItemChangeGate {
  private signature: string | undefined;
  private readonly maxChars = 2_000_000;

  reset(): void {
    this.signature = undefined;
  }

  shouldRefresh<T extends Pick<SceneItemRecord, "type" | "metadata">>(items: readonly T[]): boolean {
    let next: string;
    try {
      // Preserve all fields and IDs on every non-cosmetic item, including
      // untagged images (which can represent naval units).
      const tracked: T[] = [];
      for (const item of items) {
        if (!isGeneratedCosmetic(item)) tracked.push(item);
      }
      next = JSON.stringify(tracked);
      if (next.length > this.maxChars) {
        // Avoid retaining huge serialized scenes for future comparisons.
        this.reset();
        return true;
      }
    } catch {
      this.reset();
      return true;
    }
    const changed = this.signature === undefined || this.signature !== next;
    this.signature = next;
    if (!changed) recordPerformance("background.sceneItems.cosmeticOnlySkipped", 0);
    return changed;
  }
}
