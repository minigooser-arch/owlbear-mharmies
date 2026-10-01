import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, Vector2 } from "../shared/types";

export interface EntityInteractionProxyData {
  sourceItemId: string;
}

function imageDimensions(source: SceneItemRecord): { width: number; height: number } {
  const image = source.image;
  if (typeof image !== "object" || image === null) return { width: 64, height: 64 };
  const record = image as Record<string, unknown>;
  const width = typeof record.width === "number" && Number.isFinite(record.width) ? Math.abs(record.width) : 64;
  const height = typeof record.height === "number" && Number.isFinite(record.height) ? Math.abs(record.height) : 64;
  return {
    width: Math.max(8, width * Math.abs(source.scale?.x ?? 1)),
    height: Math.max(8, height * Math.abs(source.scale?.y ?? 1))
  };
}

export function entityInteractionProxySourceId(
  item: Pick<SceneItemRecord, "metadata">
): string | undefined {
  const value = item.metadata[METADATA_KEYS.entityInteractionProxy];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const sourceItemId = (value as Record<string, unknown>).sourceItemId;
  return typeof sourceItemId === "string" && sourceItemId.length > 0 ? sourceItemId : undefined;
}

export function createEntityInteractionProxy(
  source: SceneItemRecord,
  createId: () => string = () => crypto.randomUUID()
): SceneItemRecord {
  const { width, height } = imageDimensions(source);
  const proxyScale: Vector2 = { x: 1, y: 1 };
  return {
    id: createId(),
    type: "SHAPE",
    name: "Летопись: объект",
    position: { ...source.position },
    rotation: source.rotation ?? 0,
    scale: proxyScale,
    layer: source.layer ?? "CHARACTER",
    zIndex: Math.max(1_000_000, (source.zIndex ?? 0) + 1),
    visible: true,
    locked: true,
    disableHit: false,
    disableAutoZIndex: true,
    metadata: {
      [METADATA_KEYS.entityInteractionProxy]: {
        sourceItemId: source.id
      }
    },
    width,
    height,
    shapeType: "RECTANGLE",
    style: {
      fillColor: "#000000",
      fillOpacity: 0,
      strokeColor: "#000000",
      strokeOpacity: 0,
      strokeWidth: 0,
      strokeDash: []
    }
  };
}

export function entityInteractionProxyMatchesSource(
  proxy: SceneItemRecord,
  source: SceneItemRecord
): boolean {
  const candidate = createEntityInteractionProxy(source, () => proxy.id);
  return (
    JSON.stringify(proxy.position) === JSON.stringify(candidate.position) &&
    (proxy.rotation ?? 0) === (candidate.rotation ?? 0) &&
    JSON.stringify(proxy.scale ?? { x: 1, y: 1 }) === JSON.stringify(candidate.scale) &&
    proxy.layer === candidate.layer &&
    proxy.zIndex === candidate.zIndex &&
    proxy.visible === true &&
    proxy.locked === true &&
    proxy.disableHit === false &&
    proxy.disableAutoZIndex === true &&
    JSON.stringify(proxy.metadata[METADATA_KEYS.entityInteractionProxy]) ===
      JSON.stringify(candidate.metadata[METADATA_KEYS.entityInteractionProxy]) &&
    proxy.width === candidate.width &&
    proxy.height === candidate.height
  );
}
