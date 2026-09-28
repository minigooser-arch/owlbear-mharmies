import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState } from "../shared/types";
import { CachedCellTerrainLookup } from "./cellTerrainLookup";

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    relations: {},
    states: [{ id: "russia", name: "Россия", rulingFactionId: "red", active: true }],
    battleGroups: [],
    terrain: { ...structuredClone(DEFAULT_TERRAIN), defaultTerrainId: "plain" },
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "2,3": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null },
        "4,5": { terrainId: "missing", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

describe("CachedCellTerrainLookup", () => {
  it("describes explicit terrain and implicit default terrain", async () => {
    const lookup = new CachedCellTerrainLookup(async () => scene());
    await expect(lookup.describeCell({ x: 2, y: 3 })).resolves.toEqual({ terrainId: "forest", terrainName: "Лес", movementCostUnits: 4, recognizedStateName: "нет" });
    await expect(lookup.describeCell({ x: 20, y: 30 })).resolves.toEqual({ terrainId: "plain", terrainName: "Равнины", movementCostUnits: 2, recognizedStateName: "нет" });
  });

  it("returns movement cost and recognized state name for a cell", async () => {
    const current = scene();
    current.gridMap.cells["2,3"] = {
      ...current.gridMap.cells["2,3"]!,
      recognizedStateId: "russia"
    };
    const lookup = new CachedCellTerrainLookup(async () => current);
    await expect(lookup.describeCell({ x: 2, y: 3 })).resolves.toMatchObject({
      movementCostUnits: 4,
      recognizedStateName: "Россия"
    });
  });

  it("uses the unknown fallback for a dangling terrain id", async () => {
    const lookup = new CachedCellTerrainLookup(async () => scene());
    await expect(lookup.describeCell({ x: 4, y: 5 })).resolves.toEqual({ terrainId: null, terrainName: "неизвестна", movementCostUnits: null, recognizedStateName: "нет" });
  });

  it("does not cache loader failures", async () => {
    const loadScene = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(scene());
    const lookup = new CachedCellTerrainLookup(loadScene);
    await expect(lookup.describeCell({ x: 2, y: 3 })).resolves.toEqual({ terrainId: null, terrainName: "неизвестна", movementCostUnits: null, recognizedStateName: "нет" });
    await expect(lookup.describeCell({ x: 2, y: 3 })).resolves.toEqual({ terrainId: "forest", terrainName: "Лес", movementCostUnits: 4, recognizedStateName: "нет" });
    expect(loadScene).toHaveBeenCalledTimes(2);
  });

  it("caches repeated calls until invalidated", async () => {
    const loadScene = vi.fn(async () => scene());
    const lookup = new CachedCellTerrainLookup(loadScene);
    await lookup.describeCell({ x: 2, y: 3 });
    await lookup.describeCell({ x: 20, y: 30 });
    expect(loadScene).toHaveBeenCalledTimes(1);
    lookup.invalidate();
    await lookup.describeCell({ x: 2, y: 3 });
    expect(loadScene).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight scene load between concurrent requests after invalidation", async () => {
    let resolveLoad: ((value: SceneState) => void) | undefined;
    const loadScene = vi.fn(() => new Promise<SceneState>((resolve) => { resolveLoad = resolve; }));
    const lookup = new CachedCellTerrainLookup(loadScene);
    const first = lookup.describeCell({ x: 2, y: 3 });
    const second = lookup.describeCell({ x: 20, y: 30 });
    expect(loadScene).toHaveBeenCalledTimes(1);
    resolveLoad?.(scene());
    await expect(Promise.all([first, second])).resolves.toEqual([
      { terrainId: "forest", terrainName: "Лес", movementCostUnits: 4, recognizedStateName: "нет" },
      { terrainId: "plain", terrainName: "Равнины", movementCostUnits: 2, recognizedStateName: "нет" }
    ]);

    lookup.invalidate();
    const third = lookup.describeCell({ x: 2, y: 3 });
    const fourth = lookup.describeCell({ x: 20, y: 30 });
    expect(loadScene).toHaveBeenCalledTimes(2);
    resolveLoad?.(scene());
    await Promise.all([third, fourth]);
    expect(loadScene).toHaveBeenCalledTimes(2);
  });

  it("retries when an invalidated in-flight load resolves with stale scene data", async () => {
    const resolvers: Array<(value: SceneState) => void> = [];
    const loadScene = vi.fn(() => new Promise<SceneState>((resolve) => { resolvers.push(resolve); }));
    const lookup = new CachedCellTerrainLookup(loadScene);
    const description = lookup.describeCell({ x: 2, y: 3 });

    lookup.invalidate();
    resolvers[0]?.(scene());
    await vi.waitFor(() => expect(loadScene).toHaveBeenCalledTimes(2));
    const updated = scene();
    updated.gridMap.cells["2,3"] = {
      terrainId: "mountains",
      impassable: false,
      factionTerritoryIds: [],
      recognizedStateId: null,
      deFactoStateId: null
    };
    resolvers[1]?.(updated);

    await expect(description).resolves.toEqual({ terrainId: "mountains", terrainName: "Горы", movementCostUnits: 6, recognizedStateName: "нет" });
  });
});
