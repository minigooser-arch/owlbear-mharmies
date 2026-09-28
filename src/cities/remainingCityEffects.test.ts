import { describe, expect, it } from "vitest";
import { canalCellHasBothDomains, coastalBatteryCanRetaliate, lighthouseDetectionBonus, seaFortBlocksDisembark } from "./cityEffects";
import type { SceneState } from "../shared/types";

const scene = {
  version: 8, revision: 1, settings: {} as SceneState["settings"], turn: {} as SceneState["turn"], sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }], states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }],
  gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } } }, terrain: { version: 1, types: {} }, wars: [], relations: {}, stateRelations: {},
  strategicCities: [{ id: "c", name: "C", cells: [{ x: 0, y: 0 }], recognizedStateId: "s", deFactoStateId: "s", factionInfluenceId: "f", mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [{ id: "p", type: "PORT", cell: { x: 2, y: 2 } }, { id: "l", type: "LIGHTHOUSE", cell: { x: 3, y: 3 } }, { id: "fort", type: "SEA_FORT", cell: { x: 4, y: 4 } }, { id: "battery", type: "COASTAL_BATTERY", cell: { x: 5, y: 5 } }, { id: "canal", type: "CANAL", cell: { x: 6, y: 6 } }] }]
} as unknown as SceneState;

describe("remaining city naval effects", () => {
  it("applies lighthouse only on exact port cell and sea fort only to enemy landing", () => {
    expect(lighthouseDetectionBonus(scene, "c", { x: 2, y: 2 })).toBe(1);
    expect(lighthouseDetectionBonus(scene, "c", { x: 3, y: 3 })).toBe(0);
    expect(seaFortBlocksDisembark(scene, { x: 0, y: 0 }, true)).toBe(true);
    expect(seaFortBlocksDisembark(scene, { x: 0, y: 0 }, false)).toBe(false);
  });
  it("limits coastal battery to one retaliation per ship and exposes canal dual-domain state", () => {
    expect(coastalBatteryCanRetaliate(scene, { x: 0, y: 0 }, true, new Set(), "ship")).toBe(true);
    expect(coastalBatteryCanRetaliate(scene, { x: 0, y: 0 }, true, new Set(["ship"]), "ship")).toBe(false);
    expect(canalCellHasBothDomains(scene, { x: 6, y: 6 })).toBe(true);
  });
});
