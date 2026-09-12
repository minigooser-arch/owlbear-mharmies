import { describe, expect, it } from "vitest";
import type { GridMapState, Side, StateEntity, StateRelations } from "../shared/types";
import { applyDiplomacyForEnteredCells, politicalRouteGate } from "./authoritativeStateMovement";

const states: StateEntity[] = [
  { id: "a", name: "A", color: "#a00", rulingFactionId: "a-ruler", active: true },
  { id: "b", name: "B", color: "#0a0", rulingFactionId: "b-ruler", active: true },
  { id: "c", name: "C", color: "#00a", rulingFactionId: "c-ruler", active: true }
];

const sides: Side[] = [
  { id: "a-ruler", name: "A ruler", color: "#a00", playerIds: [], leaderPlayerIds: [], stateId: "a" },
  { id: "a-opposition", name: "A opposition", color: "#a55", playerIds: [], leaderPlayerIds: [], stateId: "a" },
  { id: "b-ruler", name: "B ruler", color: "#0a0", playerIds: [], leaderPlayerIds: [], stateId: "b" },
  { id: "c-ruler", name: "C ruler", color: "#00a", playerIds: [], leaderPlayerIds: [], stateId: "c" }
];

const bCell = { x: 1, y: 0 } as const;
const cCell = { x: 2, y: 0 } as const;
const cells = [bCell, cCell];

const gridMap: GridMapState = {
  version: 1,
  revision: 0,
  cells: {
    "0,0": { terrainId: "road", impassable: false, factionTerritoryIds: [], recognizedStateId: "a", deFactoStateId: "a" },
    "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: [], recognizedStateId: "b", deFactoStateId: "b" },
    "2,0": { terrainId: "road", impassable: false, factionTerritoryIds: [], recognizedStateId: "c", deFactoStateId: "c" }
  }
};

function input(sideId: string, stateRelations: StateRelations = {}) {
  return { sideId, cells, gridMap, sides, states, stateRelations };
}

describe("authoritative interstate movement", () => {
  it("blocks a non-ruling faction at a closed foreign border without declaring war", () => {
    const relations: StateRelations = {};
    const result = politicalRouteGate(input("a-opposition", relations));

    expect(result).toEqual({
      allowedCellCount: 0,
      blockedReason: "FOREIGN_STATE_CLOSED",
      blockedCell: { x: 1, y: 0 }
    });
    expect(relations).toEqual({});
  });

  it("declares A-B first and A-C only after each corresponding cell is actually entered", () => {
    const firstEntry = applyDiplomacyForEnteredCells({ ...input("a-ruler"), cells: [bCell] });

    expect(firstEntry.declaredPairs).toEqual([{ leftStateId: "a", rightStateId: "b" }]);
    expect(firstEntry.stateRelations.a?.b?.atWar).toBe(true);
    expect(firstEntry.stateRelations.a?.c?.atWar).not.toBe(true);

    const secondEntry = applyDiplomacyForEnteredCells({
      ...input("a-ruler", firstEntry.stateRelations),
      cells: [cCell]
    });

    expect(secondEntry.declaredPairs).toEqual([{ leftStateId: "a", rightStateId: "c" }]);
    expect(secondEntry.stateRelations.a?.b?.atWar).toBe(true);
    expect(secondEntry.stateRelations.a?.c?.atWar).toBe(true);
  });

  it("does not redeclare an already active exact-pair war", () => {
    const relations: StateRelations = {
      a: { b: { militaryAccess: false, atWar: true } },
      b: { a: { militaryAccess: false, atWar: true } }
    };

    const result = applyDiplomacyForEnteredCells({ ...input("a-ruler", relations), cells: [bCell] });

    expect(result.declaredPairs).toEqual([]);
    expect(result.stateRelations).toEqual(relations);
  });
});
