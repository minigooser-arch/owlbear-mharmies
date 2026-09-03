import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import type { SceneState, TerrainType } from "../shared/types";
import { blocksNavalLos, cellSupportsDomain, terrainSupportsDomain, validateOccupiedDomainChange } from "./movementDomains";

function terrain(movementDomains: TerrainType["movementDomains"], los: boolean): TerrainType {
  return { id: "test", name: "Тест", movementCostUnits: 2, enabled: true, movementDomains, blocksNavalLos: los };
}

describe("movement domains", () => {
  it("treats canal terrain as both LAND and SEA", () => {
    const canal = terrain(["LAND", "SEA"], false);
    expect(terrainSupportsDomain(canal, "LAND")).toBe(true);
    expect(terrainSupportsDomain(canal, "SEA")).toBe(true);
  });
  it("keeps pure land and pure sea exclusive", () => {
    expect(terrainSupportsDomain(terrain(["LAND"], true), "SEA")).toBe(false);
    expect(terrainSupportsDomain(terrain(["SEA"], false), "LAND")).toBe(false);
  });
  it("resolves the effective terrain for a cell", () => {
    const scene = { terrain: { ...DEFAULT_TERRAIN, types: { ...DEFAULT_TERRAIN.types, sea: terrain(["SEA"], false), canal: terrain(["LAND", "SEA"], false) } }, gridMap: { version: 1, revision: 1, cells: { "4,5": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }, "6,5": { terrainId: "canal", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null } } } } as Pick<SceneState, "terrain" | "gridMap">;
    expect(cellSupportsDomain(scene, { x: 4, y: 5 }, "SEA")).toBe(true);
    expect(cellSupportsDomain(scene, { x: 4, y: 5 }, "LAND")).toBe(false);
    expect(cellSupportsDomain(scene, { x: 6, y: 5 }, "LAND")).toBe(true);
    expect(cellSupportsDomain(scene, { x: 6, y: 5 }, "SEA")).toBe(true);
  });
  it("does not let a canal block naval line of sight", () => {
    const scene = { terrain: { ...DEFAULT_TERRAIN, types: { ...DEFAULT_TERRAIN.types, canal: terrain(["LAND", "SEA"], false), island: terrain(["LAND"], true) } }, gridMap: { version: 1, revision: 1, cells: { "1,0": { terrainId: "canal", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }, "2,0": { terrainId: "island", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null } } } } as Pick<SceneState, "terrain" | "gridMap">;
    expect(blocksNavalLos(scene, { x: 1, y: 0 })).toBe(false);
    expect(blocksNavalLos(scene, { x: 2, y: 0 })).toBe(true);
  });
});

describe("occupied terrain domain edits", () => {
  it("rejects removing LAND from a cell occupied by an army", () => {
    expect(validateOccupiedDomainChange(["LAND", "SEA"], ["SEA"], { hasArmy: true, hasShip: false })).toBe("CELL_DOMAIN_OCCUPIED");
  });
  it("rejects removing SEA from a cell occupied by a ship", () => {
    expect(validateOccupiedDomainChange(["LAND", "SEA"], ["LAND"], { hasArmy: false, hasShip: true })).toBe("CELL_DOMAIN_OCCUPIED");
  });
  it("allows keeping the occupied movement domain", () => {
    expect(validateOccupiedDomainChange(["LAND", "SEA"], ["LAND", "SEA"], { hasArmy: true, hasShip: true })).toBeUndefined();
  });
});
