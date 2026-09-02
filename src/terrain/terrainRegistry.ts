import type { CellState, TerrainRegistryState, TerrainType } from "../shared/types";

export type TerrainLookupResult =
  | { ok: true; terrain: TerrainType }
  | { ok: false; reason: "INVALID_TERRAIN" };

export function getTerrain(
  registry: TerrainRegistryState,
  terrainId: string | null
): TerrainLookupResult {
  const id = terrainId ?? registry.defaultTerrainId;
  const terrain = registry.types[id];
  if (!terrain || !terrain.enabled || !Number.isInteger(terrain.movementCostUnits) || terrain.movementCostUnits <= 0) {
    return { ok: false, reason: "INVALID_TERRAIN" };
  }
  return { ok: true, terrain };
}

export function getDestinationMovementCostUnits(
  registry: TerrainRegistryState,
  cell: Pick<CellState, "terrainId">
): number | undefined {
  const result = getTerrain(registry, cell.terrainId);
  return result.ok ? result.terrain.movementCostUnits : undefined;
}
