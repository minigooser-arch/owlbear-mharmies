import { expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { MapOverlayService } from "./mapOverlayService";

it("renders terrain with a translucent fill and strong outline", async () => {
  let items: SceneItemRecord[] = [];
  const port = {
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
    createId: () => "terrain-overlay"
  };

  await new MapOverlayService(port).reconcile({
    dpi: 100,
    gridMap: {
      version: 1,
      revision: 1,
      cells: { "0,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null } }
    },
    terrain: {
      defaultTerrainId: "plain",
      types: {
        forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#43a047" }
      }
    },
    sides: [],
    states: []
  });

  const terrainOverlay = items.find((item) => {
    const metadata = item.metadata[METADATA_KEYS.mapOverlay] as { kind?: string } | undefined;
    return metadata?.kind === "TERRAIN";
  });
  expect(terrainOverlay).toMatchObject({
    type: "CURVE",
    fillColor: "#43a047",
    fillOpacity: 0.24,
    strokeColor: "#43a047",
    strokeOpacity: 0.95,
    strokeWidth: 4
  });
});
