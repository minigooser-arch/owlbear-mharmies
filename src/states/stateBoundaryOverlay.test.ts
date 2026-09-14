import { describe, expect, it } from "vitest";
import type { GridMapState, StateEntity } from "../shared/types";
import { buildStateBoundarySegments } from "./stateBoundaryOverlay";

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#1a237e", rulingFactionId: "blue", active: true }
];

function grid(cells: GridMapState["cells"]): GridMapState {
  return { version: 1, revision: 1, cells };
}

describe("buildStateBoundarySegments", () => {
  it("draws only the outer perimeter of adjacent cells owned by the same recognized state", () => {
    const segments = buildStateBoundarySegments(grid({
      "0,0": { terrainId: "mountains", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: null },
      "1,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: null }
    }), states, 100);

    expect(segments).toHaveLength(6);
    expect(segments.every((segment) => segment.stateId === "russia" && segment.color === "#b71c1c")).toBe(true);
    expect(segments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { x: 100, y: 0 }, to: { x: 100, y: 100 } })
    ]));
    expect(segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }),
      expect.objectContaining({ from: { x: 0, y: 100 }, to: { x: 100, y: 100 } }),
      expect.objectContaining({ from: { x: 0, y: 0 }, to: { x: 0, y: 100 } }),
      expect.objectContaining({ from: { x: 200, y: 0 }, to: { x: 200, y: 100 } })
    ]));
  });

  it("treats a neighboring foreign recognized state as a border", () => {
    const segments = buildStateBoundarySegments(grid({
      "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: null },
      "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "germany", deFactoStateId: null }
    }), states, 100);

    expect(segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ stateId: "russia", from: { x: 100, y: 0 }, to: { x: 100, y: 100 }, color: "#b71c1c" }),
      expect.objectContaining({ stateId: "germany", from: { x: 100, y: 0 }, to: { x: 100, y: 100 }, color: "#1a237e" })
    ]));
  });

  it("ignores de-facto control and unknown recognized state ids", () => {
    const segments = buildStateBoundarySegments(grid({
      "0,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: "russia" },
      "1,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: "missing", deFactoStateId: null }
    }), states, 100);

    expect(segments).toEqual([]);
  });
});
