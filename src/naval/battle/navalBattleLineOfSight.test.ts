import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import type { GridCellCoord, SceneState, TerrainType } from "../../shared/types";
import { hasNavalBattleLineOfSight } from "./navalBattleLineOfSight";

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

function scene(cells: SceneState["gridMap"]["cells"] = {}): Pick<SceneState, "terrain" | "gridMap"> {
  return {
    terrain: {
      defaultTerrainId: "sea",
      types: {
        ...DEFAULT_TERRAIN.types,
        sea: terrain("sea", false),
        island: terrain("island", true)
      }
    },
    gridMap: { version: 1, revision: 1, cells }
  };
}

const from = { x: 0, y: 0 };
const to = { x: 3, y: 0 };

function occupied(...cells: GridCellCoord[]): GridCellCoord[] {
  return cells;
}

describe("naval battle line of sight", () => {
  it("allows fire through open sea when no ship occupies an intermediate cell", () => {
    expect(hasNavalBattleLineOfSight({
      scene: scene(),
      from,
      to,
      occupiedShipCells: occupied()
    })).toBe(true);
  });

  it("keeps terrain naval-LOS blocking rules", () => {
    expect(hasNavalBattleLineOfSight({
      scene: scene({
        "1,0": { terrainId: "island", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }),
      from,
      to,
      occupiedShipCells: occupied()
    })).toBe(false);
  });

  it("lets an intermediate ship block the line of fire", () => {
    expect(hasNavalBattleLineOfSight({
      scene: scene(),
      from,
      to,
      occupiedShipCells: occupied({ x: 2, y: 0 })
    })).toBe(false);
  });

  it("does not let occupancy of the attacker or intended target block their own shot", () => {
    expect(hasNavalBattleLineOfSight({
      scene: scene(),
      from,
      to,
      occupiedShipCells: occupied(from, to)
    })).toBe(true);
  });

  it("does not treat ships outside the traversed line cells as blockers", () => {
    expect(hasNavalBattleLineOfSight({
      scene: scene(),
      from,
      to,
      occupiedShipCells: occupied({ x: 1, y: 1 }, { x: 2, y: -1 })
    })).toBe(true);
  });
});
