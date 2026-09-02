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
      createId: () => `overlay-${nextId++}`
    },
    items: () => items
  };
}

describe("MapOverlayService", () => {
  it("renders only sparse configured cells for a GM", async () => {
    const test = harness();
    await new MapOverlayService(test.port).reconcile({
      dpi: 100,
      gridMap: {
        version: 1,
        revision: 3,
        cells: {
          "0,0": { terrainId: "forest", impassable: true, factionTerritoryIds: ["red"], recognizedStateId: "russia", deFactoStateId: "germany" },
          "2,1": { terrainId: "road", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
        }
      },
      terrain: {
        defaultTerrainId: "plain",
        types: {
          plain: { id: "plain", name: "Равнина", movementCostUnits: 2, enabled: true, color: "#999999" },
          road: { id: "road", name: "Дорога", movementCostUnits: 1, enabled: true, color: "#bbbbbb" },
          forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, color: "#66bb6a" }
        }
      },
      sides: [{ id: "red", name: "Красные", color: "#ff0000", playerIds: [], leaderPlayerIds: [], stateId: "russia" }],
      states: [{ id: "russia", name: "Российская империя", rulingFactionId: "red", active: true }, { id: "germany", name: "Германская империя", rulingFactionId: null, active: true }]
    });

    const metadata = test.items().map((item) => item.metadata[METADATA_KEYS.mapOverlay]);
    expect(test.items()).toHaveLength(6);
    expect(metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ cellKey: "0,0", kind: "TERRAIN" }),
      expect.objectContaining({ cellKey: "0,0", kind: "IMPASSABLE" }),
      expect.objectContaining({ cellKey: "0,0", kind: "TERRITORY" }),
      expect.objectContaining({ cellKey: "2,1", kind: "TERRAIN" }),
      expect.objectContaining({ cellKey: "0,0", kind: "RECOGNIZED_STATE" }),
      expect.objectContaining({ cellKey: "0,0", kind: "DEFACTO_STATE" })
    ]));
    expect(test.items().find((item) => item.type === "LABEL" && item.text === "⛔")).toBeDefined();
    expect(test.items().find((item) => item.type === "LABEL" && item.text === "Т: Красные")).toBeDefined();
    expect(test.items().find((item) => item.type === "LABEL" && item.text === "Призн.: Российская империя")).toBeDefined();
    expect(test.items().find((item) => item.type === "LABEL" && item.text === "Де-факто: Германская империя")).toBeDefined();
  });

  it("clears GM map overlays for a player", async () => {
    const test = harness();
    await new MapOverlayService(test.port).reconcile({
      dpi: 100,
      gridMap: {
        version: 1,
        revision: 1,
        cells: { "0,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null } }
      },
      terrain: {
        defaultTerrainId: "plain",
        types: { forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, color: "#66bb6a" } }
      },
      sides: [],
      states: []
    });
    expect(test.items()).toHaveLength(1);

    await new MapOverlayService(test.port).reconcile(undefined);
    expect(test.items()).toEqual([]);
  });
});
