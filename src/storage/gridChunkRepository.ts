import { METADATA_KEYS } from "../shared/constants";
import type { GridMapState, SceneItemRecord } from "../shared/types";
import type { MetadataPort } from "./metadataRepository";
import { decodeGridChunks, encodeGridChunks, GridStorageError, parseChunkCoordinate, type GridChunk, type GridManifest } from "./gridChunkCodec";

export function readGridManifest(metadata: Record<string, unknown>): GridManifest | undefined {
  const raw = metadata[METADATA_KEYS.gridManifest];
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") throw new GridStorageError("GRID_CHUNK_INVALID");
  const manifest = raw as GridManifest;
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0 ||
    !manifest.chunks || typeof manifest.chunks !== "object" || Array.isArray(manifest.chunks)) throw new GridStorageError("GRID_CHUNK_INVALID");
  const ids = new Set<string>();
  for (const [key, id] of Object.entries(manifest.chunks)) {
    parseChunkCoordinate(key);
    if (typeof id !== "string" || !id || ids.has(id)) throw new GridStorageError("GRID_CHUNK_INVALID");
    ids.add(id);
  }
  return manifest;
}

export interface StagedGrid { manifest: GridManifest; additions: SceneItemRecord[]; superseded: string[] }

export class GridChunkRepository {
  constructor(private readonly port: MetadataPort) {}

  async read(metadata: Record<string, unknown>, sceneItems?: readonly SceneItemRecord[]): Promise<GridMapState | undefined> {
    const manifest = readGridManifest(metadata);
    if (!manifest) return undefined;
    const sourceItems = sceneItems ?? await this.port.getSceneItems();
    const items = new Map(sourceItems.map(item => [item.id, item]));
    const chunks: GridChunk[] = [];
    for (const [key, id] of Object.entries(manifest.chunks)) {
      const item = items.get(id);
      if (!item) throw new GridStorageError("GRID_CHUNK_MISSING");
      const chunk = item.metadata[METADATA_KEYS.gridChunk] as GridChunk | undefined;
      if (!chunk || `${chunk.x},${chunk.y}` !== key) throw new GridStorageError("GRID_CHUNK_INVALID");
      chunks.push(chunk);
    }
    return decodeGridChunks(chunks, manifest.revision);
  }

  stage(current: GridMapState, next: GridMapState, previous?: GridManifest): StagedGrid {
    const oldChunks = encodeGridChunks(current), nextChunks = encodeGridChunks(next);
    const manifest: GridManifest = { version: 1, revision: next.revision, chunks: {} };
    const additions: SceneItemRecord[] = [];
    for (const [key, chunk] of Object.entries(nextChunks)) {
      const oldId = previous?.chunks[key];
      if (oldId && JSON.stringify(oldChunks[key]?.cells) === JSON.stringify(chunk.cells)) {
        manifest.chunks[key] = oldId;
      } else {
        const id = crypto.randomUUID();
        manifest.chunks[key] = id;
        additions.push({ id, type: "LABEL", name: `Letopis grid ${key}`, text: "", position: { x: 0, y: 0 },
          visible: false, locked: true, disableHit: true, layer: "FOG", metadata: { [METADATA_KEYS.gridChunk]: chunk } });
      }
    }
    const active = new Set(Object.values(manifest.chunks));
    return { manifest, additions, superseded: Object.values(previous?.chunks ?? {}).filter(id => !active.has(id)) };
  }

  async cleanup(ids: readonly string[]): Promise<void> {
    if (!ids.length || !this.port.deleteSceneItems) return;
    try {
      const latest = readGridManifest(await this.port.getSceneMetadata());
      const active = new Set(Object.values(latest?.chunks ?? {}));
      const removable = ids.filter(id => !active.has(id));
      if (removable.length) await this.port.deleteSceneItems(removable);
    } catch (error) {
      // Published data is authoritative even if obsolete items cannot be removed.
      console.warn("GRID_CLEANUP_FAILED", error);
    }
  }
}
