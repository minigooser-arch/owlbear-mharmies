import { describe, expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { METADATA_KEYS } from "../shared/constants";
import { VisionOverlayService } from "./visionOverlayService";

function harness() {
  let items: SceneItemRecord[] = [];
  let nextId = 1;
  return {
    port: {
      getLocalItems: async () => items.map((item) => structuredClone(item)),
      addLocalItems: async (added: readonly SceneItemRecord[]) => {
        items.push(...added.map((item) => structuredClone(item)));
      },
      updateLocalItems: async (updated: readonly SceneItemRecord[]) => {
        const byId = new Map(updated.map((item) => [item.id, structuredClone(item)]));
        items = items.map((item) => byId.get(item.id) ?? item);
      },
      deleteLocalItems: async (ids: readonly string[]) => {
        const removed = new Set(ids);
        items = items.filter((item) => !removed.has(item.id));
      },
      createId: () => `vision-${nextId++}`
    },
    items: () => items
  };
}

const base = {
  dpi: 100,
  gridMap: {
    version: 1 as const,
    revision: 1,
    cells: {
      "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
      "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
    }
  }
};

describe("VisionOverlayService", () => {
  it("draws a translucent gray fill without a border for unseen player cells", async () => {
    const test = harness();
    await new VisionOverlayService(test.port).reconcile({
      ...base,
      viewerRole: "PLAYER",
      visibleCells: new Set(["0,0"])
    });

    expect(test.items()).toHaveLength(1);
    expect(test.items()[0]).toMatchObject({
      type: "CURVE",
      points: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }],
      fillColor: "#777777",
      fillOpacity: 0.22,
      strokeOpacity: 0,
      strokeWidth: 0,
      layer: "MAP",
      locked: true,
      disableHit: true,
      metadata: { [METADATA_KEYS.visionOverlay]: { kind: "VISION_UNSEEN" } }
    });
  });

  it("removes all vision fills for the GM", async () => {
    const test = harness();
    await new VisionOverlayService(test.port).reconcile({ ...base, viewerRole: "PLAYER", visibleCells: new Set() });
    expect(test.items()).toHaveLength(1);
    await new VisionOverlayService(test.port).reconcile({ ...base, viewerRole: "GM", visibleCells: new Set() });
    expect(test.items()).toEqual([]);
  });
});
