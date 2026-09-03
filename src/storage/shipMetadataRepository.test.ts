import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, ShipState } from "../shared/types";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { MetadataRepository, type MetadataPort } from "./metadataRepository";

interface ShipRepositorySurface {
  readShips(): Promise<Array<{ item: SceneItemRecord; state: ShipState }>>;
  writeShip(itemId: string, state: ShipState, expectedRevision: number): Promise<void>;
  clearShip(itemId: string): Promise<void>;
}

function fixture(state = createRegisteredShip("red", "CRUISER", "EAST")) {
  const items: SceneItemRecord[] = [{
    id: "ship",
    type: "IMAGE",
    name: "Аврора",
    position: { x: 50, y: 50 },
    visible: false,
    metadata: { [METADATA_KEYS.ship]: structuredClone(state) }
  }];

  const port: MetadataPort = {
    getSceneMetadata: async () => ({}),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => structuredClone(items),
    updateSceneItem: async (id, update) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
    },
    patchSceneItemMetadata: async (id, key, value, update = {}) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Missing item ${id}`);
      Object.assign(item, structuredClone(update));
      if (value === undefined) {
        item.metadata = Object.fromEntries(
          Object.entries(item.metadata).filter(([metadataKey]) => metadataKey !== key)
        );
      } else {
        item.metadata[key] = structuredClone(value);
      }
    }
  };

  return {
    items,
    repository: new MetadataRepository(port) as unknown as ShipRepositorySurface
  };
}

describe("ship metadata repository", () => {
  it("reads valid ShipState from the token metadata", async () => {
    const { repository } = fixture();
    const records = await repository.readShips();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      item: { id: "ship" },
      state: { sideId: "red", classId: "CRUISER", facing: "EAST", hp: 25 }
    });
  });

  it("writes a ship using optimistic item revision", async () => {
    const original = createRegisteredShip("red", "CRUISER", "NORTH");
    const { repository, items } = fixture(original);
    const next = { ...original, hp: 17, revision: original.revision + 1 };
    await repository.writeShip("ship", next, original.revision);
    expect(items[0]?.metadata[METADATA_KEYS.ship]).toMatchObject({ hp: 17, revision: 2 });
  });

  it("clears ship metadata and restores shared source visibility", async () => {
    const { repository, items } = fixture();
    await repository.clearShip("ship");
    expect(items[0]?.metadata[METADATA_KEYS.ship]).toBeUndefined();
    expect(items[0]?.visible).toBe(true);
  });
});
