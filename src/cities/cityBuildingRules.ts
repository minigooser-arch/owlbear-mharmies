import { cellKey } from "../grid/strategicGrid";
import type {
  CityBuilding,
  GridMapState,
  Side,
  StateEntity,
  StrategicCity
} from "../shared/types";
import { resolveCityDeFactoState } from "./strategicCities";

export type CityBuildingMutationReason =
  | "BUILDING_TYPE_DUPLICATE"
  | "BUILDING_NOT_FOUND"
  | "CANAL_CELL_OCCUPIED"
  | "BUILDING_ID_DUPLICATE";

export type CityBuildingMutationResult =
  | { ok: true; city: StrategicCity }
  | { ok: false; reason: CityBuildingMutationReason };

export function isCityBuildingActive(
  city: StrategicCity,
  building: CityBuilding,
  gridMap: GridMapState,
  states: readonly StateEntity[],
  sides: readonly Side[]
): boolean {
  if (!(city.buildings ?? []).some((candidate) => candidate.id === building.id && candidate.type === building.type)) return false;
  if (!city.factionInfluenceId) return false;
  const influence = sides.find((side) => side.id === city.factionInfluenceId);
  if (!influence?.stateId || !states.some((state) => state.id === influence.stateId && state.active)) return false;
  return resolveCityDeFactoState(city, gridMap) === influence.stateId;
}

export function canUseCityBuilding(
  playerId: string,
  role: "GM" | "PLAYER",
  city: StrategicCity,
  building: CityBuilding,
  gridMap: GridMapState,
  states: readonly StateEntity[],
  sides: readonly Side[]
): boolean {
  if (!isCityBuildingActive(city, building, gridMap, states, sides)) return false;
  if (role === "GM") return true;
  const influence = sides.find((side) => side.id === city.factionInfluenceId);
  return influence?.leaderPlayerIds.includes(playerId) === true;
}

export function addCityBuilding(
  city: StrategicCity,
  building: CityBuilding,
  allCities: readonly StrategicCity[]
): CityBuildingMutationResult {
  const buildings = city.buildings ?? [];
  if (buildings.some((candidate) => candidate.id === building.id)) return { ok: false, reason: "BUILDING_ID_DUPLICATE" };
  if (buildings.some((candidate) => candidate.type === building.type)) return { ok: false, reason: "BUILDING_TYPE_DUPLICATE" };
  if (building.type === "CANAL") {
    const occupied = allCities.some((candidate) => (candidate.buildings ?? []).some((candidateBuilding) =>
      candidateBuilding.type === "CANAL" && cellKey(candidateBuilding.cell) === cellKey(building.cell)
    ));
    if (occupied) return { ok: false, reason: "CANAL_CELL_OCCUPIED" };
  }
  return { ok: true, city: { ...structuredClone(city), buildings: [...buildings.map((entry) => structuredClone(entry)), structuredClone(building)] } };
}

export function removeCityBuilding(city: StrategicCity, buildingId: string): CityBuildingMutationResult {
  const buildings = city.buildings ?? [];
  if (!buildings.some((building) => building.id === buildingId)) return { ok: false, reason: "BUILDING_NOT_FOUND" };
  return { ok: true, city: { ...structuredClone(city), buildings: buildings.filter((building) => building.id !== buildingId).map((building) => structuredClone(building)) } };
}
