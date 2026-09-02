import { describe, expect, it } from "vitest";
import { hasSupplyRoute } from "./supplyRules";
import type { CellState, GridCellCoord } from "../shared/types";

const cells = new Map<string, CellState>();
const put = (x: number, y: number, recognized: string | null, deFacto: string | null) => cells.set(`${x},${y}`, { terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:recognized,deFactoStateId:deFacto });
const read = (cell: GridCellCoord): CellState => cells.get(`${cell.x},${cell.y}`) ?? { terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:null,deFactoStateId:null };

describe("supply", () => {
  it("finds an orthogonal de-facto route to uncontested home territory", () => {
    cells.clear();
    put(0,0,"enemy","red"); put(1,0,"enemy","red"); put(2,0,"red","red");
    expect(hasSupplyRoute({ start:{x:0,y:0}, stateId:"red", readCell:read })).toBe(true);
  });

  it("does not supply through foreign de-facto territory", () => {
    cells.clear();
    put(0,0,"enemy","red"); put(1,0,"blue","blue"); put(2,0,"red","red");
    expect(hasSupplyRoute({ start:{x:0,y:0}, stateId:"red", readCell:read })).toBe(false);
  });
});
