// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import OBR from "@owlbear-rodeo/sdk";
import { createOwlbearAdapter } from "./sdkAdapter";
import { GridStoragePort } from "../tests/helpers/gridStoragePort";
import { MetadataRepository } from "../storage/metadataRepository";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";
import type { SceneItemRecord } from "../shared/types";
import { MapOverlayService } from "../terrain/mapOverlayService";
import { METADATA_KEYS } from "../shared/constants";
import { utf8Size } from "../storage/gridChunkCodec";

function fixture() {
  vi.spyOn(OBR.player, "id", "get").mockReturnValue("test-gm");
  const memory = new GridStoragePort();
  const local = new GridStoragePort();
  const collectionFor = (store: GridStoragePort) => ({
    getItems: () => store.getSceneItems(),
    addItems: async (items: unknown[]) => store.addSceneItems(items as SceneItemRecord[]),
    deleteItems: (ids: string[]) => store.deleteSceneItems(ids),
    updateItems: async (ids: unknown[], update: (drafts: SceneItemRecord[]) => void) => {
      const drafts = store.items.filter(item => ids.includes(item.id));
      update(drafts);
      store.requests.push(structuredClone(drafts));
    }
  });
  const adapter = createOwlbearAdapter({ scene: {
    getMetadata: () => memory.getSceneMetadata(), setMetadata: update => memory.patchSceneMetadata(update),
    items: collectionFor(memory), local: collectionFor(local), grid: {
      getDistance: async () => 0, getDpi: async () => 100, snapPosition: async p => p, onChange: () => () => undefined
    }
  }, broadcast: { sendMessage: async () => undefined, onMessage: () => () => undefined }, notification: { show: async () => undefined } });
  return { memory, local, adapter };
}
afterEach(() => vi.restoreAllMocks());

it("persists hidden chunks using real SDK builders and restores them", async () => {
  const { memory, adapter } = fixture();
  const repository = new MetadataRepository(adapter);
  const scene = await repository.readScene();
  scene.gridMap.cells["0,0"] = { ...DEFAULT_CELL_STATE, terrainId: "plain" };
  scene.gridMap.revision = 1; scene.revision = 1;
  await repository.writeScene(scene, 0);
  expect(memory.items).toHaveLength(1);
  expect(memory.items[0]).toMatchObject({ type: "LABEL", visible: false, locked: true, disableHit: true, text: { plainText: "" } });
  expect((await repository.readScene()).gridMap).toEqual(scene.gridMap);
});

it("bounds SDK-built local additions and updates including builder overhead", async () => {
  const { adapter, local } = fixture();
  const labels = Array.from({ length: 200 }, (_, i) => ({ id: crypto.randomUUID(), type: "LABEL", position: { x: i, y: 0 }, metadata: {}, text: "я".repeat(700) }));
  await adapter.addLocalItems(labels);
  await adapter.updateLocalItems(labels.map(item => ({ ...item, text: "ж".repeat(900) })));
  expect(local.items).toHaveLength(200);
  for (const request of local.requests) expect(utf8Size(request)).toBeLessThanOrEqual(48 * 1024);
});

it("saves, reloads, renders and edits every cell of a 61 by 115 map", async () => {
  const { memory, local, adapter } = fixture();
  const repository = new MetadataRepository(adapter);
  const scene = await repository.readScene();
  scene.gridMap.cells = Object.fromEntries(Array.from({ length: 7015 }, (_, i) => [
    `${i % 61},${Math.floor(i / 61)}`, { ...DEFAULT_CELL_STATE, terrainId: "plain" }
  ]));
  scene.gridMap.revision = 1; scene.revision = 1;
  await repository.writeScene(scene, 0);
  const loaded = await new MetadataRepository(adapter).readScene();
  expect(loaded.gridMap).toEqual(scene.gridMap);
  expect(memory.items).toHaveLength(120);
  const overlays = new MapOverlayService({ ...adapter, createId: () => crypto.randomUUID() });
  await overlays.reconcile({ dpi: 100, gridMap: loaded.gridMap, terrain: loaded.terrain, sides: [], states: [] });
  expect(local.items).toHaveLength(7015);
  loaded.revision++; loaded.gridMap.revision++;
  loaded.gridMap.cells["60,114"] = { ...DEFAULT_CELL_STATE, terrainId: "mountains" };
  await repository.writeScene(loaded, 1);
  const restored = await new MetadataRepository(adapter).readScene();
  expect(restored.gridMap).toEqual(loaded.gridMap);
  await overlays.reconcile({ dpi: 100, gridMap: restored.gridMap, terrain: restored.terrain, sides: [], states: [] });
  expect(local.items).toHaveLength(7015);
  const mountain = local.items.find(item => (item.metadata[METADATA_KEYS.mapOverlay] as { cellKey?: string }).cellKey === "60,114");
  expect(mountain?.style).toMatchObject({ fillColor: "#808080" });
  for (const request of [...memory.requests, ...local.requests]) expect(utf8Size(request)).toBeLessThanOrEqual(48 * 1024);
}, 20000);
