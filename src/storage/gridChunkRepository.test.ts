import { expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";
import { GridStoragePort } from "../tests/helpers/gridStoragePort";
import { MetadataRepository, RevisionConflict } from "./metadataRepository";
import type { SceneState } from "../shared/types";

async function fixture() {
  const port = new GridStoragePort();
  const repository = new MetadataRepository(port);
  const scene = await repository.readScene();
  scene.gridMap.cells = { "0,0": { ...DEFAULT_CELL_STATE, terrainId: "plain" }, "8,0": { ...DEFAULT_CELL_STATE, terrainId: "forest" } };
  scene.gridMap.revision = 1;
  scene.revision = 1;
  port.metadata[METADATA_KEYS.scene] = structuredClone(scene);
  return { port, repository, scene };
}

it("migrates embedded cells and rehydrates through a fresh repository", async () => {
  const { port, repository, scene } = await fixture();
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  expect((port.metadata[METADATA_KEYS.scene] as SceneState).gridMap.cells).toEqual({});
  expect(Object.keys(port.manifest().chunks)).toHaveLength(2);
  expect((await new MetadataRepository(port).readScene()).gridMap).toEqual(scene.gridMap);
  expect(port.items.every(item => item.visible === false && item.locked === true && item.disableHit === true)).toBe(true);
});

it("rewrites only the changed chunk and reuses all chunks for non-grid commands", async () => {
  const { port, repository, scene } = await fixture();
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  const original = structuredClone(port.manifest());
  const next = await repository.readScene();
  next.gridMap.cells["0,0"] = { ...DEFAULT_CELL_STATE, terrainId: "mountains" };
  next.gridMap.revision++; next.revision++;
  await repository.writeScene(next, 2);
  expect(port.manifest().chunks["0,0"]).not.toBe(original.chunks["0,0"]);
  expect(port.manifest().chunks["1,0"]).toBe(original.chunks["1,0"]);
  const ids = structuredClone(port.manifest().chunks);
  await repository.writeScene({ ...next, revision: 4 }, 3);
  expect(port.manifest().chunks).toEqual(ids);
  expect(port.items).toHaveLength(2);
});

it.each(["failAdd", "failCommit"] as const)("retains the entire previous map when %s occurs and supports retry", async failure => {
  const { port, repository, scene } = await fixture();
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  const before = await repository.readScene();
  const next = structuredClone(before);
  next.gridMap.cells["0,0"] = { ...DEFAULT_CELL_STATE, terrainId: "mountains" };
  next.gridMap.revision++; next.revision++;
  port[failure] = true;
  await expect(repository.writeScene(next, 2)).rejects.toThrow();
  expect(await repository.readScene()).toEqual(before);
  port[failure] = false;
  await repository.writeScene(next, 2);
  expect(await repository.readScene()).toEqual(next);
});

it("does not reject an already committed map when cleanup fails", async () => {
  const { port, repository, scene } = await fixture();
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  port.failDelete = true;
  const next = await repository.readScene();
  next.gridMap.cells = {}; next.gridMap.revision++; next.revision++;
  await repository.writeScene(next, 2);
  expect((await repository.readScene()).gridMap.cells).toEqual({});
});

it("rejects missing or future chunks rather than substituting water", async () => {
  const { port, repository, scene } = await fixture();
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  port.items = [];
  await expect(repository.readScene()).rejects.toThrow("GRID_CHUNK_MISSING");
  port.metadata[METADATA_KEYS.gridManifest] = { version: 99, revision: 1, chunks: {} };
  await expect(repository.readScene()).rejects.toThrow("GRID_CHUNK_INVALID");
});

it("checks revision again after staging so another commit is not overwritten", async () => {
  const { port, repository, scene } = await fixture();
  port.afterAdd = () => { (port.metadata[METADATA_KEYS.scene] as SceneState).revision = 5; };
  await expect(repository.writeScene({ ...scene, revision: 2 }, 1)).rejects.toBeInstanceOf(RevisionConflict);
  expect((port.metadata[METADATA_KEYS.scene] as SceneState).revision).toBe(5);
});

it("retries a reader overlapping manifest publication and cleanup", async () => {
  const { port, repository, scene } = await fixture();
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  const oldMetadata = structuredClone(port.metadata);
  const next = await repository.readScene();
  next.revision++; next.gridMap.revision++;
  next.gridMap.cells["0,0"] = { ...DEFAULT_CELL_STATE, terrainId: "mountains" };
  await repository.writeScene(next, 2);
  const newMetadata = structuredClone(port.metadata);
  port.metadata = oldMetadata;
  port.beforeItems = () => { port.metadata = newMetadata; };
  expect(await repository.readScene()).toEqual(next);
});

it("keeps legacy data intact when migration publication fails", async () => {
  const { port, repository, scene } = await fixture();
  const oldMetadata = structuredClone(port.metadata);
  port.failCommit = true;
  await expect(repository.writeScene({ ...scene, revision: 2 }, 1)).rejects.toThrow("GRID_MANIFEST_WRITE_FAILED");
  expect(port.metadata).toEqual(oldMetadata);
  expect(port.items).toEqual([]);
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  expect((await repository.readScene()).gridMap).toEqual(scene.gridMap);
});

it("preserves all political fields while eliminating redundant water on migration", async () => {
  const { port, repository, scene } = await fixture();
  scene.states = [
    { id: "owner", name: "Owner", rulingFactionId: null, active: true },
    { id: "occupier", name: "Occupier", rulingFactionId: null, active: true }
  ];
  const political = { ...DEFAULT_CELL_STATE, terrainId: "sea", recognizedStateId: "owner", deFactoStateId: "occupier", factionTerritoryIds: ["legacy"], impassable: true };
  scene.gridMap.cells = { "0,0": political, "1,0": { ...DEFAULT_CELL_STATE, terrainId: "sea" } };
  port.metadata[METADATA_KEYS.scene] = structuredClone(scene);
  const loaded = await repository.readScene();
  await repository.writeScene({ ...loaded, revision: 2 }, 1);
  expect((await repository.readScene()).gridMap.cells).toEqual({ "0,0": { ...political, terrainId: null } });
});
