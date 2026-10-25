import { beforeEach, describe, expect, it } from "vitest";
import { performanceSnapshot, resetPerformance } from "../performance/metrics";
import { DEFAULT_TERRAIN, METADATA_KEYS } from "../shared/constants";
import type { GridMapState, SceneItemRecord, StateEntity } from "../shared/types";
import {
  buildStateBoundarySegmentsForFields,
  compactBoundarySegments
} from "../states/stateBoundaryOverlay";
import { compactCellRectangles, type StyledCell } from "./compactOverlayGeometry";
import { MapOverlayGeometryCache, mapOverlayRenderSignature } from "./mapOverlayGeometryCache";
import { MapOverlayService } from "./mapOverlayService";

const states: StateEntity[] = [
  { id: "a", name: "A", color: "#a00", rulingFactionId: null, active: true },
  { id: "b", name: "B", color: "#00b", rulingFactionId: null, active: true }
];

function grid(): GridMapState {
  const cells: GridMapState["cells"] = {};
  for (let x = -2; x <= 4; x += 1) {
    for (let y = -2; y <= 3; y += 1) {
      cells[`${x},${y}`] = {
        terrainId: x % 2 === 0 ? "forest" : "road",
        recognizedStateId: x < 1 ? "a" : "b",
        deFactoStateId: y < 1 ? "a" : "b",
        factionTerritoryIds: [],
        impassable: false
      };
    }
  }
  return { version: 1, revision: 8, cells };
}

function metric(name: string): number {
  return performanceSnapshot().find(record => record.name === name)?.calls ?? 0;
}

function sorted(gridMap: GridMapState) {
  return Object.entries(gridMap.cells).sort(([a], [b]) => a.localeCompare(b));
}

function styled(gridMap: GridMapState, field: "terrainId" | "recognizedStateId"): StyledCell[] {
  return sorted(gridMap).flatMap(([key, cell]) => {
    const value = cell[field];
    if (!value) return [];
    const [x, y] = key.split(",").map(Number);
    if (x === undefined || y === undefined) return [];
    return [{ cell: { x, y }, styleKey: value }];
  });
}

function canonical(items: readonly SceneItemRecord[]): unknown[] {
  return items
    .map(item => ({
      key: (item.metadata[METADATA_KEYS.mapOverlay] as { key: string }).key,
      type: item.type,
      position: item.position,
      points: item.points,
      layer: item.layer,
      fillColor: item.fillColor,
      fillOpacity: item.fillOpacity,
      strokeColor: item.strokeColor,
      strokeWidth: item.strokeWidth,
      locked: item.locked
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function harness() {
  let items: SceneItemRecord[] = [];
  let serial = 0;
  let additions = 0, deletions = 0;
  return {
    port: {
      getLocalItems: async () => structuredClone(items),
      addLocalItems: async (added: readonly SceneItemRecord[]) => {
        additions += added.length;
        items.push(...structuredClone([...added]));
      },
      updateLocalItems: async (updated: readonly SceneItemRecord[]) => {
        const patches = new Map(updated.map(item => [item.id, structuredClone(item)]));
        items = items.map(item => patches.get(item.id) ?? item);
      },
      deleteLocalItems: async (ids: readonly string[]) => {
        deletions += ids.length;
        items = items.filter(item => !ids.includes(item.id));
      },
      createId: () => `local-${++serial}`
    },
    items: () => canonical(items),
    stats: () => ({ additions, deletions })
  };
}

describe("per-layer map overlay geometry cache", () => {
  beforeEach(resetPerformance);

  it("matches the original full-grid rectangle and boundary algorithms exactly", () => {
    const memo = new MapOverlayGeometryCache();
    const map = grid();
    const terrainCells = styled(map, "terrainId");
    const stateCells = styled(map, "recognizedStateId");

    expect(memo.rectangles("terrain", terrainCells)).toEqual(compactCellRectangles(terrainCells));
    expect(memo.rectangles("recognized", stateCells)).toEqual(compactCellRectangles(stateCells));
    const raw = buildStateBoundarySegmentsForFields(map, states, 100);
    expect(memo.stateBoundaries(map, states, 100, sorted(map))).toEqual({
      recognized: compactBoundarySegments(raw.recognized),
      deFacto: compactBoundarySegments(raw.deFacto)
    });
    expect(memo.rectangles("terrain", terrainCells)).toEqual(compactCellRectangles(terrainCells));
    expect(memo.rectangles("recognized", stateCells)).toEqual(compactCellRectangles(stateCells));
    memo.stateBoundaries(map, states, 100, sorted(map));

    expect(metric("map.geometry.terrainBuild")).toBe(1);
    expect(metric("map.geometry.terrainHit")).toBe(1);
    expect(metric("map.geometry.recognizedBuild")).toBe(1);
    expect(metric("map.geometry.recognizedHit")).toBe(1);
    expect(metric("map.geometry.boundariesBuild")).toBe(1);
    expect(metric("map.geometry.boundariesHit")).toBe(1);
  });

  it("rebuilds only affected layers and keeps cross-chunk continuous borders intact", () => {
    const memo = new MapOverlayGeometryCache();
    const map = grid();
    const terrainCells = styled(map, "terrainId");
    const recognizedCells = styled(map, "recognizedStateId");
    memo.rectangles("terrain", terrainCells);
    memo.rectangles("recognized", recognizedCells);
    memo.stateBoundaries(map, states, 100, sorted(map));

    // Change de-facto territory without changing terrain or recognized state.
    const change = map.cells["0,0"];
    if (!change) throw new Error("Missing cell");
    change.deFactoStateId = "b";
    expect(memo.rectangles("terrain", styled(map, "terrainId"))).toEqual(compactCellRectangles(terrainCells));
    expect(memo.rectangles("recognized", styled(map, "recognizedStateId"))).toEqual(compactCellRectangles(recognizedCells));
    const boundary = memo.stateBoundaries(map, states, 100, sorted(map));
    const expected = buildStateBoundarySegmentsForFields(map, states, 100);
    expect(boundary.recognized).toEqual(compactBoundarySegments(expected.recognized));
    expect(boundary.deFacto).toEqual(compactBoundarySegments(expected.deFacto));
    expect(metric("map.geometry.terrainBuild")).toBe(1);
    expect(metric("map.geometry.recognizedBuild")).toBe(1);
    expect(metric("map.geometry.boundariesBuild")).toBe(2);

    change.terrainId = "road";
    memo.rectangles("terrain", styled(map, "terrainId"));
    memo.rectangles("recognized", styled(map, "recognizedStateId"));
    memo.stateBoundaries(map, states, 100, sorted(map));
    expect(metric("map.geometry.terrainBuild")).toBe(2);
    expect(metric("map.geometry.recognizedBuild")).toBe(1);
    expect(metric("map.geometry.boundariesBuild")).toBe(2);

    memo.clear();
    memo.rectangles("terrain", styled(map, "terrainId"));
    memo.stateBoundaries(map, states, 100, sorted(map));
    expect(metric("map.geometry.terrainBuild")).toBe(3);
    expect(metric("map.geometry.boundariesBuild")).toBe(3);
  });

  it("detects same-revision edits and ignores changes unrelated to rendering", () => {
    const map = grid();
    const source = { viewerRole: "GM" as const, dpi: 100, gridMap: map, terrain: structuredClone(DEFAULT_TERRAIN), states };
    const first = mapOverlayRenderSignature(source);
    const change = map.cells["0,0"];
    if (!change) throw new Error("Missing cell");
    change.factionTerritoryIds.push("a");
    change.impassable = true;
    expect(mapOverlayRenderSignature(source)).toBe(first);
    change.recognizedStateId = "b";
    expect(mapOverlayRenderSignature(source)).not.toBe(first);
    const second = mapOverlayRenderSignature(source);
    change.recognizedStateId = "a";
    change.terrainId = "road";
    expect(mapOverlayRenderSignature(source)).not.toBe(second);
    const colors = structuredClone(states);
    const firstColor = colors[0];
    if (!firstColor) throw new Error("Missing state color");
    firstColor.color = "#123456";
    expect(mapOverlayRenderSignature({ ...source, states: colors })).not.toBe(mapOverlayRenderSignature(source));
    expect(mapOverlayRenderSignature({ ...source, viewerRole: "PLAYER" })).not.toBe(mapOverlayRenderSignature(source));
    const renamedTerrain = structuredClone(source.terrain);
    const road = renamedTerrain.types.road;
    if (!road) throw new Error("Missing road terrain");
    road.id = "new-road-style";
    expect(mapOverlayRenderSignature({ ...source, terrain: renamedTerrain })).not.toBe(
      mapOverlayRenderSignature(source)
    );
  });

  it("renders identical map overlays and reuses unaffected layers across consecutive reconciliations", async () => {
    const withCache = harness();
    const reference = harness();
    const memo = new MapOverlayGeometryCache();
    const map = grid();
    const terrain = structuredClone(DEFAULT_TERRAIN);
    const source = {
      viewerRole: "GM" as const, dpi: 100,
      gridMap: map, terrain, sides: [], states
    };
    const cachedService = new MapOverlayService(withCache.port, memo);
    const referenceService = new MapOverlayService(reference.port);

    await cachedService.reconcile(source);
    await referenceService.reconcile(source);
    expect(withCache.items()).toEqual(reference.items());
    const first = withCache.stats();
    await cachedService.reconcile(source);
    expect(withCache.stats()).toEqual(first);

    const cell = map.cells["-2,1"];
    if (!cell) throw new Error("Missing territory cell");
    // y=1 initially belongs to B; transfer it to A to change the perimeter.
    cell.deFactoStateId = "a";
    const terrainBuildsBefore = metric("map.geometry.terrainBuild");
    const recognizedBuildsBefore = metric("map.geometry.recognizedBuild");
    const boundaryBuildsBefore = metric("map.geometry.boundariesBuild");
    await cachedService.reconcile(source);
    expect(metric("map.geometry.terrainBuild")).toBe(terrainBuildsBefore);
    expect(metric("map.geometry.recognizedBuild")).toBe(recognizedBuildsBefore);
    expect(metric("map.geometry.boundariesBuild")).toBe(boundaryBuildsBefore + 1);
    expect(metric("map.geometry.terrainHit")).toBe(2);
    expect(metric("map.geometry.recognizedHit")).toBe(2);
    await referenceService.reconcile(source);
    expect(withCache.items()).toEqual(reference.items());

    // A state color change updates all relevant styled boundary/fill tokens.
    const changedStates = structuredClone(states);
    const firstState = changedStates[0];
    if (!firstState) throw new Error("Missing state");
    firstState.color = "#0f0";
    await cachedService.reconcile({ ...source, states: changedStates });
    await referenceService.reconcile({ ...source, states: changedStates });
    expect(withCache.items()).toEqual(reference.items());
  });
});
