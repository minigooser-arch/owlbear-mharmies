import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { VisionLightService } from "./visionLightService";

class MemoryVisionLightPort {
  items: SceneItemRecord[] = [];
  private nextId = 1;

  async getLocalItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.items);
  }

  async addLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    this.items.push(...structuredClone(items));
  }

  async updateLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    const updates = new Map(items.map((item) => [item.id, item]));
    this.items = this.items.map((item) => structuredClone(updates.get(item.id) ?? item));
  }

  async deleteLocalItems(ids: readonly string[]): Promise<void> {
    const deleted = new Set(ids);
    this.items = this.items.filter((item) => !deleted.has(item.id));
  }

  createId(): string {
    return `light-${this.nextId++}`;
  }
}

describe("army vision lights", () => {
  it("creates a hard-edged local primary light with the army detection radius", async () => {
    const port = new MemoryVisionLightPort();
    const service = new VisionLightService(port);

    await service.reconcile([{
      sourceItemId: "army-red",
      sideId: "red",
      position: { x: 450, y: 750 },
      rangeCells: 6
    }], { isGM: false, memberSideIds: new Set(["red"]) }, 150);

    expect(port.items).toEqual([expect.objectContaining({
      id: "light-1",
      type: "LIGHT",
      position: { x: 450, y: 750 },
      layer: "FOG",
      zIndex: 0,
      sourceRadius: 0,
      attenuationRadius: 900,
      falloff: 0,
      innerAngle: 360,
      outerAngle: 360,
      lightType: "PRIMARY",
      locked: true,
      disableHit: true,
      disableAutoZIndex: true,
      metadata: {
        [METADATA_KEYS.visionLight]: { sourceItemId: "army-red" }
      }
    })]);
  });

  it("moves existing lights, removes stale ones, and omits zero-range armies", async () => {
    const port = new MemoryVisionLightPort();
    const service = new VisionLightService(port);

    await service.reconcile([
      { sourceItemId: "army-red", sideId: "red", position: { x: 50, y: 50 }, rangeCells: 4 },
      { sourceItemId: "army-blue", sideId: "blue", position: { x: 150, y: 50 }, rangeCells: 2 }
    ], { isGM: true, memberSideIds: new Set() }, 100);
    const redLightId = port.items.find((item) =>
      (item.metadata[METADATA_KEYS.visionLight] as { sourceItemId?: string }).sourceItemId === "army-red"
    )?.id;
    await service.reconcile([
      { sourceItemId: "army-red", sideId: "red", position: { x: 250, y: 50 }, rangeCells: 5 },
      { sourceItemId: "army-blue", sideId: "blue", position: { x: 150, y: 50 }, rangeCells: 0 }
    ], { isGM: true, memberSideIds: new Set() }, 100);

    expect(port.items).toHaveLength(1);
    expect(port.items[0]).toMatchObject({
      id: redLightId,
      position: { x: 250, y: 50 },
      attenuationRadius: 500,
      metadata: {
        [METADATA_KEYS.visionLight]: { sourceItemId: "army-red" }
      }
    });
  });

  it("never creates enemy vision lights for a player", async () => {
    const port = new MemoryVisionLightPort();
    const service = new VisionLightService(port);
    const armies = [
      { sourceItemId: "army-red", sideId: "red", position: { x: 50, y: 50 }, rangeCells: 4 },
      { sourceItemId: "army-blue", sideId: "blue", position: { x: 150, y: 50 }, rangeCells: 4 }
    ];

    await service.reconcile(
      armies,
      { isGM: false, memberSideIds: new Set(["red"]) },
      100
    );

    expect(port.items).toHaveLength(1);
    expect(port.items[0]?.metadata[METADATA_KEYS.visionLight]).toEqual({
      sourceItemId: "army-red"
    });
  });
});
