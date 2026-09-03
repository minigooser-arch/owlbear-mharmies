import type { GridCellCoord, MovementDomain, SceneState, TerrainType } from "../shared/types";
import { readCell } from "./gridMap";
import { getTerrain } from "./terrainRegistry";

type TerrainScene = Pick<SceneState, "terrain" | "gridMap">;

export function terrainSupportsDomain(terrain: TerrainType, domain: MovementDomain): boolean {
  return terrain.movementDomains.includes(domain);
}

export function cellSupportsDomain(
  scene: TerrainScene,
  cell: GridCellCoord,
  domain: MovementDomain
): boolean {
  const resolved = getTerrain(scene.terrain, readCell(scene.gridMap, cell).terrainId);
  return resolved.ok && terrainSupportsDomain(resolved.terrain, domain);
}

export function blocksNavalLos(scene: TerrainScene, cell: GridCellCoord): boolean {
  const resolved = getTerrain(scene.terrain, readCell(scene.gridMap, cell).terrainId);
  return !resolved.ok || resolved.terrain.blocksNavalLos;
}

export interface MovementDomainOccupancy {
  hasArmy: boolean;
  hasShip: boolean;
}

export function validateOccupiedDomainChange(
  currentDomains: readonly MovementDomain[],
  nextDomains: readonly MovementDomain[],
  occupancy: MovementDomainOccupancy
): "CELL_DOMAIN_OCCUPIED" | undefined {
  const removesLand = currentDomains.includes("LAND") && !nextDomains.includes("LAND");
  const removesSea = currentDomains.includes("SEA") && !nextDomains.includes("SEA");
  if ((removesLand && occupancy.hasArmy) || (removesSea && occupancy.hasShip)) {
    return "CELL_DOMAIN_OCCUPIED";
  }
  return undefined;
}
