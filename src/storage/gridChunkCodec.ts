import type { CellState, GridMapState } from "../shared/types";

export type PackedCell = [number, string | null, boolean, string[], string | null, string | null];
export interface GridChunk { version: 1; x: number; y: number; revision: number; cells: PackedCell[] }
export interface GridManifestV1 { version: 1; revision: number; chunks: Record<string, string> }
export interface GridManifestPointerV2 { version: 2; revision: number; partCount: number }
/** Legacy alias retained while repository code handles v1/v2 at its boundary. */
export type GridManifest = GridManifestV1;
export interface GridManifestPart { version: 1; revision: number; index: number; chunks: Record<string, string> }
export const GRID_MANIFEST_PART_DEFAULT_BUDGET = 32 * 1024;
export function utf8Size(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export class GridStorageError extends Error {
  constructor(readonly code: "GRID_CHUNK_INVALID" | "GRID_CHUNK_TOO_LARGE" | "GRID_CHUNK_MISSING" | "GRID_CHUNK_WRITE_FAILED" | "GRID_MANIFEST_WRITE_FAILED" | "GRID_METADATA_TOO_LARGE" | "GRID_MANIFEST_PART_TOO_LARGE", options?: ErrorOptions) {
    super(code, options);
    this.name = "GridStorageError";
  }
}

function assertManifestRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new GridStorageError("GRID_CHUNK_INVALID");
}

function validateChunkMapping(chunks: unknown): Record<string, string> {
  if (!chunks || typeof chunks !== "object" || Array.isArray(chunks)) throw new GridStorageError("GRID_CHUNK_INVALID");
  const result: Record<string, string> = {};
  const ids = new Set<string>();
  for (const [key, id] of Object.entries(chunks)) {
    parseChunkCoordinate(key);
    if (typeof id !== "string" || !id || ids.has(id)) throw new GridStorageError("GRID_CHUNK_INVALID");
    ids.add(id);
    result[key] = id;
  }
  return result;
}

export function splitGridManifestParts(
  chunks: Record<string, string>,
  revision: number,
  maxBytes = GRID_MANIFEST_PART_DEFAULT_BUDGET
): GridManifestPart[] {
  assertManifestRevision(revision);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new GridStorageError("GRID_MANIFEST_PART_TOO_LARGE");
  const validated = validateChunkMapping(chunks);
  const parts: GridManifestPart[] = [];
  let current: Record<string, string> = {};
  const flush = () => {
    if (Object.keys(current).length) {
      const part = { version: 1 as const, revision, index: parts.length, chunks: current };
      if (utf8Size(part) > maxBytes) throw new GridStorageError("GRID_MANIFEST_PART_TOO_LARGE");
      parts.push(part);
      current = {};
    }
  };
  for (const [key, id] of Object.entries(validated)) {
    const candidate = { version: 1 as const, revision, index: parts.length, chunks: { ...current, [key]: id } };
    if (utf8Size(candidate) > maxBytes && Object.keys(current).length) {
      flush();
      current = { [key]: id };
      if (utf8Size({ version: 1, revision, index: parts.length, chunks: current }) > maxBytes) {
        throw new GridStorageError("GRID_MANIFEST_PART_TOO_LARGE");
      }
    } else {
      current = candidate.chunks;
    }
  }
  flush();
  return parts;
}

export function validateGridManifestParts(
  pointer: GridManifestPointerV2,
  parts: readonly GridManifestPart[]
): Record<string, string> {
  if (pointer.version !== 2 || !Number.isSafeInteger(pointer.revision) || pointer.revision < 0 ||
      !Number.isSafeInteger(pointer.partCount) || pointer.partCount < 0 || parts.length !== pointer.partCount) {
    throw new GridStorageError(parts.length < pointer.partCount ? "GRID_CHUNK_MISSING" : "GRID_CHUNK_INVALID");
  }
  const result: Record<string, string> = {};
  const indexes = new Set<number>();
  const ids = new Set<string>();
  for (const part of parts) {
    if (!part || part.version !== 1 || part.revision !== pointer.revision ||
        !Number.isSafeInteger(part.index) || part.index < 0 || part.index >= pointer.partCount ||
        indexes.has(part.index)) throw new GridStorageError("GRID_CHUNK_INVALID");
    indexes.add(part.index);
    if (!part.chunks || typeof part.chunks !== "object" || Array.isArray(part.chunks)) {
      throw new GridStorageError("GRID_CHUNK_INVALID");
    }
    for (const [key, id] of Object.entries(part.chunks)) {
      parseChunkCoordinate(key);
      if (typeof id !== "string" || !id || ids.has(id) || Object.hasOwn(result, key)) {
        throw new GridStorageError("GRID_CHUNK_INVALID");
      }
      ids.add(id);
      result[key] = id;
    }
  }
  if (indexes.size !== pointer.partCount) throw new GridStorageError("GRID_CHUNK_MISSING");
  return result;
}

function invalid(): never { throw new GridStorageError("GRID_CHUNK_INVALID"); }
function nullableId(value: unknown): boolean { return value === null || typeof value === "string" && value.length > 0; }
export function parseChunkCoordinate(key: string): [number, number] {
  if (!/^-?\d+,-?\d+$/.test(key)) return invalid();
  const [x, y] = key.split(",").map(Number);
  if (x === undefined || y === undefined || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || `${x},${y}` !== key) return invalid();
  return [x, y];
}

export function encodeGridChunks(grid: GridMapState): Record<string, GridChunk> {
  const chunks: Record<string, GridChunk> = {};
  for (const [key, cell] of Object.entries(grid.cells)) {
    const [x, y] = parseChunkCoordinate(key);
    const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
    const chunk = chunks[`${cx},${cy}`] ??= { version: 1, x: cx, y: cy, revision: grid.revision, cells: [] };
    chunk.cells.push([(y - cy * 8) * 8 + x - cx * 8, cell.terrainId, cell.impassable,
      [...cell.factionTerritoryIds], cell.recognizedStateId, cell.deFactoStateId]);
  }
  for (const chunk of Object.values(chunks)) chunk.cells.sort((a, b) => a[0] - b[0]);
  decodeGridChunks(Object.values(chunks), grid.revision);
  return chunks;
}

export function decodeGridChunks(chunks: readonly GridChunk[], revision: number): GridMapState {
  if (!Number.isSafeInteger(revision) || revision < 0) return invalid();
  const cells: Record<string, CellState> = {};
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk || chunk.version !== 1 || !Number.isSafeInteger(chunk.x) || !Number.isSafeInteger(chunk.y) ||
      !Number.isSafeInteger(chunk.revision) || chunk.revision < 0 || chunk.revision > revision || !Array.isArray(chunk.cells)) return invalid();
    if (utf8Size(chunk) > 12 * 1024) throw new GridStorageError("GRID_CHUNK_TOO_LARGE");
    const chunkKey = `${chunk.x},${chunk.y}`;
    if (seen.has(chunkKey)) return invalid();
    seen.add(chunkKey);
    const indexes = new Set<number>();
    for (const entry of chunk.cells) {
      if (!Array.isArray(entry) || entry.length !== 6) return invalid();
      const [index, terrainId, impassable, factions, recognizedStateId, deFactoStateId] = entry;
      if (!Number.isInteger(index) || index < 0 || index >= 64 || indexes.has(index) || !nullableId(terrainId) ||
        typeof impassable !== "boolean" || !Array.isArray(factions) || factions.some(id => typeof id !== "string" || !id.length) ||
        !nullableId(recognizedStateId) || !nullableId(deFactoStateId)) return invalid();
      indexes.add(index);
      const x = chunk.x * 8 + index % 8, y = chunk.y * 8 + Math.floor(index / 8);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return invalid();
      cells[`${x},${y}`] = { terrainId, impassable, factionTerritoryIds: [...factions], recognizedStateId, deFactoStateId };
    }
  }
  return { version: 1, revision, cells };
}
