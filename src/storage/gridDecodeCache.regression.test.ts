import { beforeEach, describe, expect, it, vi } from "vitest";
import { performanceSnapshot, resetPerformance } from "../performance/metrics";
import { METADATA_KEYS } from "../shared/constants";
import type { GridMapState, SceneState } from "../shared/types";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";
import { GridStoragePort } from "../tests/helpers/gridStoragePort";
import { GridChunkDecodeCache } from "./gridChunkRepository";
import { LRLedgerRepository } from "./lrLedgerRepository";
import { DemographyAuditRepository } from "./demographyAuditRepository";
import { MetadataRepository } from "./metadataRepository";

function cell(terrainId: string) {
  return { ...DEFAULT_CELL_STATE, terrainId, factionTerritoryIds: ["owner"] };
}

async function prepare() {
  const port = new GridStoragePort();
  const repository = new MetadataRepository(port);
  const base = await repository.readScene();
  const gridMap: GridMapState = {
    version: 1, revision: 1,
    cells: {
      "0,0": cell("plain"),
      "8,0": cell("forest")
    }
  };
  port.metadata[METADATA_KEYS.scene] = { ...base, revision: 1, gridMap };
  await repository.writeScene({ ...base, revision: 2, gridMap }, 1);
  return { port, repository };
}

describe("bounded grid chunk decode cache", () => {
  beforeEach(resetPerformance);

  it("decodes only once across stable frames and does not leak mutable grid state", async () => {
    const { repository } = await prepare();

    const first = await repository.readScene();
    const initiallyDecoded = performanceSnapshot().find(x => x.name === "storage.grid.chunkDecode")?.calls ?? 0;
    const firstCell = first.gridMap.cells["0,0"];
    if (!firstCell) throw new Error("Missing cell in cached map");
    firstCell.terrainId = "mountains";
    firstCell.factionTerritoryIds.push("intruder");

    const second = await repository.readFrame();
    expect(second.scene.gridMap.cells["0,0"]).toMatchObject(cell("plain"));
    expect(second.scene.gridMap.cells["0,0"]?.factionTerritoryIds).toEqual(["owner"]);
    const decoded = performanceSnapshot().find(x => x.name === "storage.grid.chunkDecode")?.calls ?? 0;
    const hits = performanceSnapshot().find(x => x.name === "storage.grid.chunkCacheHit")?.calls ?? 0;
    expect(decoded).toBe(initiallyDecoded);
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it("invalidates a cached decode if the same chunk ID is modified in place", async () => {
    const { port, repository } = await prepare();
    expect((await repository.readScene()).gridMap.cells["0,0"]?.terrainId).toBe("plain");
    const item = port.items.find(x => x.metadata[METADATA_KEYS.gridChunk] !== undefined &&
      (x.metadata[METADATA_KEYS.gridChunk] as { x?: number }).x === 0);
    if (!item) throw new Error("Missing persisted grid chunk");
    const chunk = item.metadata[METADATA_KEYS.gridChunk] as {
      cells: Array<[number, string | null, boolean, string[], string | null, string | null]>
    };
    const packed = chunk.cells[0];
    if (!packed) throw new Error("Missing packed cell");
    packed[1] = "mountains";
    const latest = await repository.readScene();
    expect(latest.gridMap.cells["0,0"]?.terrainId).toBe("mountains");

    packed[2] = "false" as unknown as boolean;
    await expect(repository.readScene()).rejects.toThrow("GRID_CHUNK_INVALID");
  });

  it("still rejects missing chunks or manifest parts after an earlier cache hit", async () => {
    const { port, repository } = await prepare();
    await repository.readScene();
    const chunk = port.items.find(x => x.metadata[METADATA_KEYS.gridChunk] !== undefined);
    if (!chunk) throw new Error("Missing grid chunk");
    port.items = port.items.filter(item => item.id !== chunk.id);
    await expect(repository.readScene()).rejects.toThrow("GRID_CHUNK_MISSING");

    const restored = await prepare();
    await restored.repository.readScene();
    restored.port.items = restored.port.items.filter(
      item => item.metadata[METADATA_KEYS.gridManifestPart] === undefined
    );
    await expect(restored.repository.readScene()).rejects.toThrow("GRID_CHUNK_MISSING");
  });

  it("does not reuse a valid decode against an older manifest revision", () => {
    const cache = new GridChunkDecodeCache();
    const chunk = {
      version: 1 as const,
      x: 0, y: 0, revision: 5,
      cells: [[0, "plain", false, [], null, null]] as [number, string | null, boolean, string[], string | null, string | null][]
    };
    expect(cache.decode("same-id", chunk, 5)["0,0"]?.terrainId).toBe("plain");
    expect(() => cache.decode("same-id", chunk, 4)).toThrow("GRID_CHUNK_INVALID");
  });

  it("hydrates each journal once rather than twice while constructing a frame", async () => {
    const { repository } = await prepare();
    const lrSpy = vi.spyOn(LRLedgerRepository.prototype, "read");
    const auditSpy = vi.spyOn(DemographyAuditRepository.prototype, "read");
    try {
      await repository.readFrame();
      expect(lrSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledTimes(1);
    } finally {
      lrSpy.mockRestore();
      auditSpy.mockRestore();
    }
  });

  it("reads scene revision without decoding a broken manifest or fetching scene items", async () => {
    const { port, repository } = await prepare();
    const stored = port.metadata[METADATA_KEYS.scene] as SceneState;
    port.metadata[METADATA_KEYS.gridManifest] = { version: 2, revision: 1, partCount: 999 };
    port.getSceneItems = async () => { throw new Error("Must not fetch scene items"); };

    await expect(repository.readSceneRevision()).resolves.toBe(stored.revision);
    await expect(repository.readScene()).rejects.toThrow();
  });

  it("invalidates caches at scene lifecycle boundaries without losing data", async () => {
    const { repository } = await prepare();
    await repository.readScene();
    resetPerformance();
    repository.clearReadCaches();
    await repository.readScene();
    const misses = performanceSnapshot().find(x => x.name === "storage.grid.chunkDecode")?.calls ?? 0;
    expect(misses).toBe(2);
  });
});
