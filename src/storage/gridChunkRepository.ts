import { METADATA_KEYS } from "../shared/constants";
import type { GridMapState, SceneItemRecord } from "../shared/types";
import type { MetadataPort } from "./metadataRepository";
import {
  decodeGridChunks,
  encodeGridChunks,
  GridStorageError,
  parseChunkCoordinate,
  splitGridManifestParts,
  validateGridManifestParts,
  type GridChunk,
  type GridManifest,
  type GridManifestPart,
  type GridManifestPointerV2
} from "./gridChunkCodec";

export type StoredGridManifest = GridManifest | GridManifestPointerV2;

export function readGridManifest(metadata: Record<string, unknown>): StoredGridManifest | undefined {
  const raw = metadata[METADATA_KEYS.gridManifest];
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new GridStorageError("GRID_CHUNK_INVALID");
  const manifest = raw as Record<string, unknown>;
  if (manifest.version === 1) {
    const revision = manifest.revision;
    const chunks = manifest.chunks;
    if (!Number.isSafeInteger(revision) || (revision as number) < 0 || !chunks || typeof chunks !== "object" || Array.isArray(chunks)) {
      throw new GridStorageError("GRID_CHUNK_INVALID");
    }
    const ids = new Set<string>();
    for (const [key, id] of Object.entries(chunks)) {
      parseChunkCoordinate(key);
      if (typeof id !== "string" || !id || ids.has(id)) throw new GridStorageError("GRID_CHUNK_INVALID");
      ids.add(id);
    }
    return { version: 1, revision: revision as number, chunks: { ...chunks } as Record<string, string> };
  }
  if (manifest.version === 2 && Number.isSafeInteger(manifest.revision) && (manifest.revision as number) >= 0 &&
      Number.isSafeInteger(manifest.partCount) && (manifest.partCount as number) >= 0) {
    return { version: 2, revision: manifest.revision as number, partCount: manifest.partCount as number };
  }
  throw new GridStorageError("GRID_CHUNK_INVALID");
}

export function manifestPartId(revision: number, index: number): string {
  return `letopis-grid-manifest-${revision}-${index}`;
}

export interface StagedGrid {
  manifest: GridManifestPointerV2;
  additions: SceneItemRecord[];
  superseded: string[];
  supersededManifestParts: string[];
}

function sameChunkCells(left: GridChunk | undefined, right: GridChunk): boolean {
  return JSON.stringify(left?.cells ?? null) === JSON.stringify(right.cells);
}

function sameMapping(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => left[key] === right[key]);
}

function partRecord(part: GridManifestPart): SceneItemRecord {
  return {
    id: manifestPartId(part.revision, part.index),
    type: "LABEL",
    name: `Letopis grid manifest ${part.revision}/${part.index}`,
    text: "",
    position: { x: 0, y: 0 },
    visible: false,
    locked: true,
    disableHit: true,
    layer: "FOG",
    metadata: { [METADATA_KEYS.gridManifestPart]: part }
  };
}

export class GridChunkRepository {
  constructor(private readonly port: MetadataPort) {}

  private async sourceItems(sceneItems?: readonly SceneItemRecord[]): Promise<readonly SceneItemRecord[]> {
    return sceneItems ?? await this.port.getSceneItems();
  }

  private resolveChunkIds(manifest: StoredGridManifest, sceneItems: readonly SceneItemRecord[]): Record<string, string> {
    if (manifest.version === 1) return manifest.chunks;
    const items = new Map(sceneItems.map(item => [item.id, item]));
    const parts: GridManifestPart[] = [];
    for (let index = 0; index < manifest.partCount; index++) {
      const item = items.get(manifestPartId(manifest.revision, index));
      if (!item) throw new GridStorageError("GRID_CHUNK_MISSING");
      const part = item.metadata[METADATA_KEYS.gridManifestPart] as GridManifestPart | undefined;
      if (!part) throw new GridStorageError("GRID_CHUNK_INVALID");
      parts.push(part);
    }
    return validateGridManifestParts(manifest, parts);
  }

  async read(metadata: Record<string, unknown>, sceneItems?: readonly SceneItemRecord[]): Promise<GridMapState | undefined> {
    const manifest = readGridManifest(metadata);
    if (!manifest) return undefined;
    const sourceItems = await this.sourceItems(sceneItems);
    const chunkIds = this.resolveChunkIds(manifest, sourceItems);
    const items = new Map(sourceItems.map(item => [item.id, item]));
    const chunks: GridChunk[] = [];
    for (const [key, id] of Object.entries(chunkIds)) {
      const item = items.get(id);
      if (!item) throw new GridStorageError("GRID_CHUNK_MISSING");
      const chunk = item.metadata[METADATA_KEYS.gridChunk] as GridChunk | undefined;
      if (!chunk || `${chunk.x},${chunk.y}` !== key) throw new GridStorageError("GRID_CHUNK_INVALID");
      chunks.push(chunk);
    }
    return decodeGridChunks(chunks, manifest.revision);
  }

  async stage(
    current: GridMapState,
    next: GridMapState,
    previous: StoredGridManifest | undefined,
    sceneItems?: readonly SceneItemRecord[]
  ): Promise<StagedGrid> {
    const sourceItems = previous?.version === 2
      ? await this.sourceItems(sceneItems)
      : (sceneItems ?? []);
    const previousChunks = previous ? this.resolveChunkIds(previous, sourceItems) : {};
    const oldChunks = encodeGridChunks(current), nextChunks = encodeGridChunks(next);
    const manifestChunks: Record<string, string> = {};
    const additions: SceneItemRecord[] = [];
    for (const [key, chunk] of Object.entries(nextChunks)) {
      const oldId = previousChunks[key];
      if (oldId && sameChunkCells(oldChunks[key], chunk)) {
        manifestChunks[key] = oldId;
      } else {
        const id = crypto.randomUUID();
        manifestChunks[key] = id;
        additions.push({ id, type: "LABEL", name: `Letopis grid ${key}`, text: "", position: { x: 0, y: 0 },
          visible: false, locked: true, disableHit: true, layer: "FOG", metadata: { [METADATA_KEYS.gridChunk]: chunk } });
      }
    }

    if (previous?.version === 2 && previous.revision === next.revision &&
        !sameMapping(previousChunks, manifestChunks)) {
      throw new GridStorageError("GRID_CHUNK_INVALID");
    }

    const parts = splitGridManifestParts(manifestChunks, next.revision);
    const manifest: GridManifestPointerV2 = { version: 2, revision: next.revision, partCount: parts.length };
    const reuseExistingParts = previous?.version === 2 && previous.revision === manifest.revision &&
      previous.partCount === manifest.partCount && sameMapping(previousChunks, manifestChunks);
    if (!reuseExistingParts) {
      for (const part of parts) {
        const id = manifestPartId(part.revision, part.index);
        const existing = sourceItems.find(item => item.id === id);
        if (!existing) additions.push(partRecord(part));
        else {
          const currentPart = existing.metadata[METADATA_KEYS.gridManifestPart];
          if (JSON.stringify(currentPart) !== JSON.stringify(part)) throw new GridStorageError("GRID_CHUNK_INVALID");
        }
      }
    }
    const activeChunks = new Set(Object.values(manifestChunks));
    const superseded = Object.values(previousChunks).filter(id => !activeChunks.has(id));
    const supersededManifestParts = previous?.version === 2
      ? Array.from({ length: previous.partCount }, (_, index) => manifestPartId(previous.revision, index))
      : [];
    return { manifest, additions, superseded, supersededManifestParts };
  }

  async cleanup(ids: readonly string[]): Promise<void> {
    if (!ids.length || !this.port.deleteSceneItems) return;
    try {
      const metadata = await this.port.getSceneMetadata();
      const latest = readGridManifest(metadata);
      const items = await this.port.getSceneItems();
      const active = new Set<string>();
      if (latest) {
        const chunks = this.resolveChunkIds(latest, items);
        for (const id of Object.values(chunks)) active.add(id);
        if (latest.version === 2) {
          for (let index = 0; index < latest.partCount; index++) active.add(manifestPartId(latest.revision, index));
        }
      }
      const removable = ids.filter(id => !active.has(id));
      if (removable.length) await this.port.deleteSceneItems(removable);
    } catch (error) {
      console.warn("GRID_CLEANUP_FAILED", error);
    }
  }
}
