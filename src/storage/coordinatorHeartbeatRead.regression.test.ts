import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneState } from "../shared/types";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";
import { GridStoragePort } from "../tests/helpers/gridStoragePort";
import { MetadataRepository } from "./metadataRepository";

async function fixture() {
  const port = new GridStoragePort();
  const repository = new MetadataRepository(port);
  const base = await repository.readScene();
  const gridMap = {
    version: 1 as const,
    revision: 1,
    cells: { "0,0": { ...DEFAULT_CELL_STATE, terrainId: "forest" } }
  };
  port.metadata[METADATA_KEYS.scene] = { ...base, revision: 1, gridMap };
  await repository.writeScene({ ...base, revision: 2, gridMap }, 1);
  return { port, repository };
}

function changingLease(
  port: GridStoragePort,
  owner: (read: number) => string = () => "gm-a"
) {
  let reads = 0;
  const original = port.getSceneMetadata.bind(port);
  port.getSceneMetadata = async () => {
    const metadata = await original();
    const scene = metadata[METADATA_KEYS.scene] as SceneState;
    reads += 1;
    metadata[METADATA_KEYS.scene] = {
      ...scene,
      coordinatorLease: {
        connectionId: owner(reads),
        epoch: reads,
        expiresAt: 2_000_000_000_000 + reads * 5_000
      }
    };
    return metadata;
  };
  return () => reads;
}

describe("coordinator heartbeat and storage snapshot isolation", () => {
  it("allows a stable chunked read despite every same-GM heartbeat renewal", async () => {
    const { port, repository } = await fixture();
    const calls = changingLease(port);
    const items = await repository.readScene();
    expect(items.gridMap.cells["0,0"]?.terrainId).toBe("forest");
    expect(items.coordinatorLease).toMatchObject({
      connectionId: "gm-a", epoch: calls()
    });
    expect(calls()).toBe(2);
  });

  it("allows stable readItemFrame and readFrame across same-owner renewals", async () => {
    const { port, repository } = await fixture();
    const calls = changingLease(port);
    const frame = await repository.readItemFrame();
    expect(frame.baseScene.coordinatorLease?.epoch).toBe(calls());
    const result = await repository.readFrame(frame);
    expect(result.scene.gridMap.cells["0,0"]?.terrainId).toBe("forest");
    expect(result.scene.coordinatorLease).toMatchObject({ connectionId: "gm-a", epoch: calls() });
    expect(calls()).toBe(3);
  });

  it("retries when a different GM takes over during hydration", async () => {
    const { port, repository } = await fixture();
    const calls = changingLease(port, n => n < 2 ? "gm-a" : "gm-b");
    let itemReads = 0;
    const getItems = port.getSceneItems.bind(port);
    port.getSceneItems = async () => {
      itemReads += 1;
      return getItems();
    };
    const scene = await repository.readScene();
    expect(scene.coordinatorLease?.connectionId).toBe("gm-b");
    expect(scene.gridMap.cells["0,0"]?.terrainId).toBe("forest");
    expect(itemReads).toBe(2);
    expect(calls()).toBe(4);
  });

  it("does not ignore gameplay or manifest changes under same-owner heartbeats", async () => {
    const { port, repository } = await fixture();
    const calls = changingLease(port);
    const readItems = port.getSceneItems.bind(port);
    let changed = false;
    port.getSceneItems = async () => {
      const items = await readItems();
      if (!changed) {
        changed = true;
        const scene = port.metadata[METADATA_KEYS.scene] as SceneState;
        port.metadata[METADATA_KEYS.scene] = { ...scene, revision: scene.revision + 1 };
      }
      return items;
    };
    const scene = await repository.readScene();
    expect(scene.revision).toBe(3);
    expect(calls()).toBe(4);
    expect(scene.coordinatorLease?.connectionId).toBe("gm-a");
  });

  it("keeps scene writes strictly fenced during concurrent GM handover", async () => {
    const { port, repository } = await fixture();
    const original = await repository.readScene();
    const writeCount = port.requests.length;
    changingLease(port, n => n % 2 === 0 ? "gm-b" : "gm-a");
    await expect(repository.writeScene({
      ...original, revision: original.revision + 1
    }, original.revision)).rejects.toThrow("GRID_CHUNK_MISSING");
    expect(port.requests).toHaveLength(writeCount);
  });

  it("rejects missing chunks even if the GM lease changes continually", async () => {
    const { port, repository } = await fixture();
    port.items = [];
    changingLease(port);
    await expect(repository.readScene()).rejects.toThrow("GRID_CHUNK_MISSING");
  });
});
