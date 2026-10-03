import { describe, expect, it } from "vitest";
import { canalCellHasBothDomains, coastalBatteryCanRetaliate, coastalBatteryRetaliationCity, lighthouseDetectionBonus, marineStationAllowsCrossing, seaFortBlocksDisembark } from "./cityEffects";
import type { SceneState } from "../shared/types";

const scene = {
  version: 8, revision: 1, settings: {} as SceneState["settings"], turn: {} as SceneState["turn"], sides: [{ id: "f", name: "F", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "s" }, { id: "enemy", name: "Enemy", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "e" }], states: [{ id: "s", name: "S", color: "#fff", rulingFactionId: "f", active: true }, { id: "e", name: "E", color: "#000", rulingFactionId: "enemy", active: true }],
  gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" }, "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }, "2,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "s", deFactoStateId: "s" } } }, terrain: { version: 1, types: {} }, wars: [], relations: { f: { enemy: "ENEMY" } }, stateRelations: {},
  strategicCities: [{ id: "c", name: "C", cells: [{ x: 0, y: 0 }], recognizedStateId: "s", deFactoStateId: "s", factionInfluenceId: "f", mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [{ id: "p", type: "PORT", cell: { x: 2, y: 2 } }, { id: "l", type: "LIGHTHOUSE", cell: { x: 3, y: 3 } }, { id: "fort", type: "SEA_FORT", cell: { x: 4, y: 4 } }, { id: "battery", type: "COASTAL_BATTERY", cell: { x: 5, y: 5 } }, { id: "canal", type: "CANAL", cell: { x: 6, y: 6 } }, { id: "marine", type: "MARINE_STATION", cell: { x: 0, y: 0 } }] }]
} as unknown as SceneState;

describe("remaining city naval effects", () => {
  it("applies lighthouse only on exact port cell and sea fort only to enemy landing", () => {
    expect(lighthouseDetectionBonus(scene, "c", { x: 2, y: 2 }, "f")).toBe(1);
    expect(lighthouseDetectionBonus(scene, "c", { x: 3, y: 3 }, "f")).toBe(0);
    expect(seaFortBlocksDisembark(scene, { x: 0, y: 0 }, "enemy")).toBe(true);
    expect(seaFortBlocksDisembark(scene, { x: 0, y: 0 }, "f")).toBe(false);
  });
  it("limits coastal battery to one retaliation per ship and exposes canal dual-domain state", () => {
    expect(coastalBatteryCanRetaliate(scene, { x: 0, y: 0 }, true, new Set(), "ship")).toBe(true);
    expect(coastalBatteryCanRetaliate(scene, { x: 0, y: 0 }, true, new Set(["ship"]), "ship")).toBe(false);
    expect(canalCellHasBothDomains(scene, { x: 6, y: 6 })).toBe(true);
    expect(marineStationAllowsCrossing(scene, "c", "f", [{ x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(true);
    expect(marineStationAllowsCrossing(scene, "c", "enemy", [{ x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(false);
    expect(coastalBatteryRetaliationCity(scene, { x: 0, y: 0 }, "enemy")?.id).toBe("c");
    const used = structuredClone(scene);
    used.strategicCities![0]!.coastalBatteryRetaliatedOnTurn = used.turn.turnNumber;
    expect(coastalBatteryRetaliationCity(used, { x: 0, y: 0 }, "enemy")).toBeUndefined();
  });
});
