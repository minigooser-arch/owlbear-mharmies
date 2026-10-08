import { describe, expect, it } from "vitest";
import type { ArmyState, CellState, SceneState, StrategicCity } from "../shared/types";
import { isArmySupplied, recalculateArmySupply } from "./supplyService";

const A = "a", B = "b";

function land(owner: string, occupier: string | null = owner): CellState {
  return { terrainId: null, impassable: false, factionTerritoryIds: [],
    recognizedStateId: owner, deFactoStateId: occupier };
}
function capital(id: string, state: string, x: number): StrategicCity {
  return { id, name: id, cells: [{ x, y: 0 }], recognizedStateId: state,
    deFactoStateId: state, factionInfluenceId: state === A ? "side-a" : "side-b",
    mayorId: null, isCapital: true, historicalBuildTypeCount: 0, buildings: [] };
}
function scene(): SceneState {
  const cells: Record<string, CellState> = {};
  for (let x = 0; x <= 24; x++) cells[`${x},0`] = land(A);
  cells["50,0"] = land(B);
  return {
    gridMap: { version: 1, revision: 1, cells },
    strategicCities: [capital("capital-a", A, 0), capital("capital-b", B, 50)],
    sides: [
      { id: "side-a", name: "A", stateId: A, color: "#f00", playerIds: [], leaderPlayerIds: [] },
      { id: "side-b", name: "B", stateId: B, color: "#00f", playerIds: [], leaderPlayerIds: [] }
    ],
    states: [
      { id: A, name: A, rulingFactionId: "side-a", active: true },
      { id: B, name: B, rulingFactionId: "side-b", active: true }
    ],
    turn: { turnNumber: 4 }
  } as unknown as SceneState;
}
function army(sideId: string): ArmyState {
  return { sideId, supply: { supplied: false, checkedOnTurn: 3 }, revision: 1 } as ArmyState;
}

describe("batched supply performance without stateful invalidation", () => {
  it("reuses a state's source scan across distinct army cells during one recalculation", () => {
    const map = scene();
    const cities = map.strategicCities ?? [];
    let sourceScans = 0;
    Object.defineProperty(map, "strategicCities", {
      configurable: true,
      get() { sourceScans++; return cities; }
    });
    const armies: Record<string, ArmyState> = {};
    const positions: Record<string, { x: number; y: number }> = {};
    for (let x = 1; x <= 24; x++) {
      armies[`army-${x}`] = army("side-a");
      positions[`army-${x}`] = { x, y: 0 };
    }
    const result = recalculateArmySupply(map, armies, positions);
    expect(Object.values(result).every((unit) => unit.supply.supplied)).toBe(true);
    expect(sourceScans).toBe(1);
  });

  it("keeps separate supply results for opposing states and factions", () => {
    const map = scene();
    const armies = { friendly: army("side-a"), enemy: army("side-b"), foreign: army("side-b") };
    const cells = {
      friendly: { x: 24, y: 0 }, enemy: { x: 24, y: 0 }, foreign: { x: 50, y: 0 }
    };
    const result = recalculateArmySupply(map, armies, cells);
    expect(result.friendly?.supply.supplied).toBe(true);
    expect(result.enemy?.supply.supplied).toBe(false);
    expect(result.foreign?.supply.supplied).toBe(true);
  });

  it("never retains a supply result between two recalculation commands", () => {
    const map = scene();
    const armies = { unit: army("side-a") };
    const cells = { unit: { x: 24, y: 0 } };
    expect(recalculateArmySupply(map, armies, cells).unit?.supply.supplied).toBe(true);
    map.gridMap.cells["12,0"] = land(A, B);
    expect(recalculateArmySupply(map, armies, cells).unit?.supply.supplied).toBe(false);
    expect(isArmySupplied(map, armies.unit, cells.unit)).toBe(false);
  });

  it("does not mutate army inputs when recalculating supply", () => {
    const map = scene();
    const original = army("side-a");
    const result = recalculateArmySupply(map, { unit: original }, { unit: { x: 1, y: 0 } });
    expect(original.supply).toEqual({ supplied: false, checkedOnTurn: 3 });
    expect(result.unit?.supply).toEqual({ supplied: true, checkedOnTurn: 4 });
    expect(result.unit?.revision).toBe(2);
  });
});
