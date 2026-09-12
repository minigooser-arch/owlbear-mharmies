import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { MapOverlayService } from "./mapOverlayService";

function harness() {
  let items: SceneItemRecord[] = [];
  let nextId = 1;
  return {
    port: {
      getLocalItems: async () => items.map((item) => structuredClone(item)),
      addLocalItems: async (added: readonly SceneItemRecord[]) => { items.push(...added.map((item) => structuredClone(item))); },
      updateLocalItems: async (updated: readonly SceneItemRecord[]) => {
        const byId = new Map(updated.map((item) => [item.id, structuredClone(item)]));
        items = items.map((item) => byId.get(item.id) ?? item);
      },
      deleteLocalItems: async (ids: readonly string[]) => {
        const removed = new Set(ids);
        items = items.filter((item) => !removed.has(item.id));
      },
      createId: () => `overlay-${nextId++}`
    },
    items: () => items
  };
}

describe("state boundary overlay integration", () => {
  it("keeps terrain fills visible while drawing the recognized-state perimeter", async () => {
    const test = harness();
    await new MapOverlayService(test.port).reconcile({
      dpi: 100,
      gridMap: {
        version: 1,
        revision: 1,
        cells: {
          "0,0": { terrainId: "mountains", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: null },
          "1,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: null }
        }
      },
      terrain: {
        defaultTerrainId: "plain",
        types: {
          mountains: { id: "mountains", name: "Горы", movementCostUnits: 6, enabled: true, color: "#808080" },
          forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, color: "#2E8B57" }
        }
      },
      sides: [],
      states: [{ id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: null, active: true }]
    });

    const terrain = test.items().filter((item) => {
      const metadata = item.metadata[METADATA_KEYS.mapOverlay] as { kind?: string } | undefined;
      return metadata?.kind === "TERRAIN";
    });
    const boundaries = test.items().filter((item) => {
      const metadata = item.metadata[METADATA_KEYS.mapOverlay] as { kind?: string; stateId?: string } | undefined;
      return metadata?.kind === "STATE_BOUNDARY" && metadata.stateId === "russia";
    });

    expect(terrain).toHaveLength(2);
    expect(boundaries).toHaveLength(6);
    expect(boundaries.every((item) => item.type === "CURVE" && item.strokeColor === "#b71c1c")).toBe(true);
    expect(test.items().some((item) =>
      item.type === "LABEL" &&
      typeof item.text === "string" &&
      item.text.startsWith("Призн.:")
    )).toBe(false);
  });
});
