import { describe, expect, it } from "vitest";
import type { ArmyState, CellState, GridCellCoord, SceneState, StrategicCity } from "../shared/types";
import { findSupplyPath, isArmySupplied, recalculateArmySupply } from "./supplyService";

const A = "state-a";
const B = "state-b";

function cell(recognizedStateId: string | null, deFactoStateId: string | null = recognizedStateId, impassable = false): CellState {
  return { terrainId: null, impassable, factionTerritoryIds: [], recognizedStateId, deFactoStateId };
}

function city(
  id: string,
  recognizedStateId: string,
  cells: GridCellCoord[],
  patch: Partial<StrategicCity> = {}
): StrategicCity {
  return {
    id, name: id, cells, recognizedStateId, deFactoStateId: recognizedStateId,
    factionInfluenceId: recognizedStateId === A ? "f-a" : "f-b",
    mayorId: null, isCapital: false, historicalBuildTypeCount: 0, buildings: [],
    ...patch
  };
}

function scene(
  cells: Record<string, CellState>,
  strategicCities: StrategicCity[]
): SceneState {
  return {
    version: 8, revision: 1,
    settings: {} as SceneState["settings"],
    turn: { turnNumber: 3, phase: "MOVEMENT", autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null },
    sides: [
      { id: "f-a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: A },
      { id: "f-b", name: "B", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: B }
    ],
    states: [
      { id: A, name: "A", rulingFactionId: "f-a", active: true },
      { id: B, name: "B", rulingFactionId: "f-b", active: true }
    ],
    gridMap: { version: 1, revision: 1, cells },
    terrain: { version: 1, types: {} },
    wars: [], relations: {}, stateRelations: {}, battleGroups: [], strategicCities
  } as unknown as SceneState;
}

const capital = () => city("a-capital", A, [{ x: 2, y: 0 }], { isCapital: true });
const port = (portCell: GridCellCoord = { x: 2, y: 0 }) =>
  city("a-port", A, [{ x: 2, y: 0 }], {
    buildings: [{ id: "port", type: "PORT", cell: portCell }]
  });
const fromStart = (map: SceneState, stateId = A, maxVisitedCells?: number) =>
  findSupplyPath(map, { x: 0, y: 0 }, stateId, maxVisitedCells);

describe("capital and port state supply", () => {
  it("supplies an army by an orthogonal route to its state's capital", () => {
    const map = scene({ "0,0": cell(A), "1,0": cell(A), "2,0": cell(A) }, [capital()]);
    expect(fromStart(map)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("traces a line through territory occupied by the army's state", () => {
    const map = scene({
      "0,0": cell(A),
      "1,0": cell(B, A),
      "2,0": cell(A)
    }, [capital()]);
    expect(fromStart(map)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("uses recognized national territory when no de-facto occupier is assigned", () => {
    const map = scene({
      "0,0": cell(A, null), "1,0": cell(A, null), "2,0": cell(A, null)
    }, [capital()]);
    expect(fromStart(map)?.length).toBe(3);
  });

  it("does not traverse home territory occupied by a foreign state", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A, B), "2,0": cell(A)
    }, [capital()]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not traverse diagonally adjacent cells", () => {
    const map = scene({
      "0,0": cell(A), "1,1": cell(A)
    }, [city("capital", A, [{ x: 1, y: 1 }], { isCapital: true })]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not cross an impassable friendly cell", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A, A, true), "2,0": cell(A)
    }, [capital()]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not source supply from an enemy-occupied capital", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A), "2,0": cell(A, B)
    }, [capital()]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not convert an occupied foreign capital into the occupier's capital", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(B, A)
    }, [city("b-capital", B, [{ x: 1, y: 0 }], { isCapital: true, deFactoStateId: A })]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not require a port or a railway for capital supply", () => {
    const map = scene({ "0,0": cell(A) }, [
      city("capital", A, [{ x: 0, y: 0 }], { isCapital: true })
    ]);
    expect(fromStart(map)).toEqual([{ x: 0, y: 0 }]);
  });

  it("supplies from an active owned port even without a reachable capital", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(B, A), "2,0": cell(A)
    }, [port()]);
    expect(fromStart(map)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("supplies from a controlled port in an occupied enemy city", () => {
    const occupiedPort = city("occupied-b-port", B, [{ x: 2, y: 0 }], {
      deFactoStateId: A,
      factionInfluenceId: "f-a",
      buildings: [{ id: "port", type: "PORT", cell: { x: 2, y: 0 } }]
    });
    const map = scene({
      "0,0": cell(A), "1,0": cell(B, A), "2,0": cell(B, A)
    }, [occupiedPort]);
    expect(fromStart(map)?.length).toBe(3);
  });

  it("does not borrow a foreign faction's port", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(B, A), "2,0": cell(B)
    }, [city("b-port", B, [{ x: 2, y: 0 }], {
      buildings: [{ id: "foreign-port", type: "PORT", cell: { x: 2, y: 0 } }]
    })]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not use an inactive port even if its city is occupied by the army's state", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A), "2,0": cell(B, A)
    }, [city("b-port", B, [{ x: 2, y: 0 }], {
      deFactoStateId: A,
      buildings: [{ id: "port", type: "PORT", cell: { x: 2, y: 0 } }]
    })]);
    expect(fromStart(map)).toBeNull();
  });

  it("does not source supply from a port cell occupied by an enemy", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A), "2,0": cell(A), "3,0": cell(A, B)
    }, [port({ x: 3, y: 0 })]);
    expect(fromStart(map)).toBeNull();
  });

  it("allows an offshore port to supply via its controlled coastal city cells", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A), "2,0": cell(A)
      // 3,0 is a sparse unclaimed water cell; it is not a supply corridor.
    }, [port({ x: 3, y: 0 })]);
    expect(fromStart(map)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("never treats a railway station or logistics center as a supply source", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A)
    }, [city("railway", A, [{ x: 1, y: 0 }], {
      buildings: [
        { id: "rail", type: "RAILWAY_STATION", cell: { x: 1, y: 0 } },
        { id: "logistics", type: "MILITARY_LOGISTICS_CENTER", cell: { x: 1, y: 0 } }
      ]
    })]);
    expect(fromStart(map)).toBeNull();
  });

  it("requires an actual source even when the entire path is friendly", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A)
    }, [city("ordinary-city", A, [{ x: 1, y: 0 }])]);
    expect(fromStart(map)).toBeNull();
  });

  it("enforces the traversal limit without accepting a partial path", () => {
    const map = scene({
      "0,0": cell(A), "1,0": cell(A), "2,0": cell(A)
    }, [capital()]);
    expect(fromStart(map, A, 2)).toBeNull();
    expect(fromStart(map, A, 3)?.length).toBe(3);
  });

  it("rechecks supply immediately when the port is removed", () => {
    const cells = { "0,0": cell(A), "1,0": cell(A), "2,0": cell(A) };
    const withPort = scene(cells, [port()]);
    const army = {
      sideId: "f-a",
      supply: { supplied: true, checkedOnTurn: 2 },
      revision: 1
    } as ArmyState;
    expect(isArmySupplied(withPort, army, { x: 0, y: 0 })).toBe(true);
    const withoutPort = scene(cells, [city("a-port", A, [{ x: 2, y: 0 }])]);
    const updated = recalculateArmySupply(withoutPort, { army }, { army: { x: 0, y: 0 } });
    expect(updated.army?.supply).toEqual({ supplied: false, checkedOnTurn: 3, unsuppliedSinceTurn: 3 });
    expect(updated.army?.revision).toBe(2);
  });

  it("keeps transport-embarked armies exempt from land supply", () => {
    const map = scene({ "0,0": cell(B) }, []);
    map.ships = { transport: { classId: "TRANSPORT", embarkedArmyId: "army", additionalEmbarkedArmyId: null } } as unknown as SceneState["ships"];
    const army = {
      sideId: "f-a",
      embarkedOnShipId: "transport",
      supply: { supplied: false, checkedOnTurn: 2, unsuppliedSinceTurn: 2 },
      revision: 1
    } as ArmyState;
    const next = recalculateArmySupply(map, { army }, { army: { x: 0, y: 0 } });
    expect(next.army?.supply.supplied).toBe(true);
  });
});
