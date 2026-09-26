import { describe, expect, it } from "vitest";
import type { GridMapState, StateEntity } from "../shared/types";
import {
  buildStateBoundarySegments,
  buildStateBoundarySegmentsForFields,
  compactBoundarySegments,
  type StateBoundarySegment
} from "./stateBoundaryOverlay";

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#1a237e", rulingFactionId: "blue", active: true }
];

function grid(cells: GridMapState["cells"]): GridMapState {
  return { version: 1, revision: 1, cells };
}

describe("buildStateBoundarySegments", () => {
  it("matches both legacy boundary layers in one shared traversal", () => {
    const map = grid({
      "-1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: "germany" },
      "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: "germany" },
      "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "germany", deFactoStateId: "russia" },
      "0,1": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "missing", deFactoStateId: "russia" },
      "invalid": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: "germany" }
    });
    const combined = buildStateBoundarySegmentsForFields(map, states, 100);
    expect(combined.recognized).toEqual(buildStateBoundarySegments(map, states, 100, "recognizedStateId"));
    expect(combined.deFacto).toEqual(buildStateBoundarySegments(map, states, 100, "deFactoStateId"));
    expect(combined.recognized).toContainEqual(expect.objectContaining({ stateId: "russia" }));
    expect(combined.deFacto).toContainEqual(expect.objectContaining({ stateId: "germany" }));
  });

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

  it("builds separate de-facto control borders", () => {
    const segments = buildStateBoundarySegments(grid({
      "0,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: "russia" },
      "1,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: "russia" },
      "2,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: "missing", deFactoStateId: null }
    }), states, 100, "deFactoStateId");

    expect(segments).toHaveLength(6);
    expect(segments.every((segment) => segment.stateId === "russia" && segment.color === "#b71c1c")).toBe(true);
    expect(segments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { x: 100, y: 0 }, to: { x: 100, y: 100 } })
    ]));
  });
});

function segment(
  stateId: string,
  color: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): StateBoundarySegment {
  return { stateId, color, from: { x: fromX, y: fromY }, to: { x: toX, y: toY } };
}

describe("compactBoundarySegments", () => {
  it("merges touching horizontal and vertical segments", () => {
    expect(compactBoundarySegments([
      segment("russia", "#f00", 0, 0, 100, 0),
      segment("russia", "#f00", 100, 0, 200, 0),
      segment("russia", "#f00", 300, 0, 200, 0),
      segment("russia", "#f00", 400, 200, 400, 100),
      segment("russia", "#f00", 400, 200, 400, 300)
    ])).toEqual([
      segment("russia", "#f00", 0, 0, 300, 0),
      segment("russia", "#f00", 400, 100, 400, 300)
    ]);
  });

  it("is independent of insertion order and endpoint direction", () => {
    const expected = [segment("russia", "#f00", 0, 0, 300, 0)];
    const ordered = [
      segment("russia", "#f00", 0, 0, 100, 0),
      segment("russia", "#f00", 100, 0, 200, 0),
      segment("russia", "#f00", 200, 0, 300, 0)
    ];
    expect(compactBoundarySegments(ordered)).toEqual(expected);
    expect(compactBoundarySegments([ordered[2], segment("russia", "#f00", 200, 0, 100, 0), ordered[0]])).toEqual(expected);
  });

  it("does not merge across gaps, corners, states, or colors", () => {
    const input = [
      segment("russia", "#f00", 0, 0, 100, 0),
      segment("russia", "#f00", 200, 0, 300, 0),
      segment("russia", "#f00", 100, 0, 100, 100),
      segment("germany", "#f00", 100, 0, 200, 0),
      segment("russia", "#00f", 100, 0, 200, 0)
    ];
    expect(compactBoundarySegments(input)).toHaveLength(5);
  });

  it("compacts a straight 115-unit edge into one segment", () => {
    const input = Array.from({ length: 115 }, (_, y) =>
      segment("russia", "#f00", 6100, y * 100, 6100, (y + 1) * 100)
    );
    expect(compactBoundarySegments(input)).toEqual([
      segment("russia", "#f00", 6100, 0, 6100, 11500)
    ]);
  });
});
