import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import type { SceneState, TerrainType } from "../../shared/types";
import { hasNavalLineOfSight, strategicLineCells } from "./navalLineOfSight";

function terrain(id: string, blocksNavalLos: boolean): TerrainType {
  return {
    id,
    name: id,
    movementCostUnits: 2,
    enabled: true,
    movementDomains: blocksNavalLos ? ["LAND"] : ["SEA"],
    blocksNavalLos
  };
}

function scene(cells: SceneState["gridMap"]["cells"], types: Record<string, TerrainType>): Pick<SceneState, "terrain" | "gridMap"> {
  return {
    terrain: {
      defaultTerrainId: "sea",
      types: { ...DEFAULT_TERRAIN.types, sea: terrain("sea", false), ...types }
    },
    gridMap: { version: 1, revision: 1, cells }
  };
}

describe("strategic naval line of sight", () => {
  it("returns deterministic intermediate cells for a straight line", () => {
    expect(strategicLineCells({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
  });

  it("allows line of sight through open sea and canal cells", () => {
    const input = scene({
      "1,0": { terrainId: "canal", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
      "2,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
    }, {
      canal: { ...terrain("canal", false), movementDomains: ["LAND", "SEA"] }
    });
    expect(hasNavalLineOfSight(input, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
  });

  it("blocks line of sight when an intermediate LAND cell blocks naval LOS", () => {
    const input = scene({
      "1,0": { terrainId: "island", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
    }, { island: terrain("island", true) });
    expect(hasNavalLineOfSight(input, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it("treats legacy terrain without naval metadata as blocking", () => {
    const legacy: TerrainType = { id: "legacy", name: "legacy", movementCostUnits: 2, enabled: true };
    const input = scene({
      "1,0": { terrainId: "legacy", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
    }, { legacy });
    expect(hasNavalLineOfSight(input, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it("does not treat the observer or target endpoint as an intermediate blocker", () => {
    const input = scene({}, {});
    expect(hasNavalLineOfSight(input, { x: 4, y: 4 }, { x: 4, y: 4 })).toBe(true);
    expect(strategicLineCells({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });
});
