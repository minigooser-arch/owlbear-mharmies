import type { GridCellCoord, SceneState, ShipState, StrategicCity } from "../shared/types";
import { cellKey } from "../grid/strategicGrid";
import { isCityBuildingActive } from "./cityBuildingRules";
import { shipEffectiveMaxHp } from "../upgrades/unitUpgrades";

function activeBuilding(scene: SceneState, city: StrategicCity, type: string) {
  const building = (city.buildings ?? []).find((candidate) => candidate.type === type);
  return building && isCityBuildingActive(city, building, scene.gridMap, scene.states, scene.sides) ? building : undefined;
}

export function cityForCell(scene: SceneState, cell: GridCellCoord): StrategicCity | undefined {
  return (scene.strategicCities ?? []).find((city) => city.cells.some((candidate) => cellKey(candidate) === cellKey(cell)));
}

export function armyFormationCap(scene: SceneState, cityId: string | null): number {
  const city = cityId ? (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId) : undefined;
  return city && activeBuilding(scene, city, "BARRACKS") ? 15 : 10;
}

export function hasActiveCityBuilding(scene: SceneState, cityId: string, type: string): boolean {
  const city = (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId);
  return city ? Boolean(activeBuilding(scene, city, type)) : false;
}

export function portTransportMovementCost(scene: SceneState, cityId: string | null, targetCell: GridCellCoord): number {
  const city = cityId ? (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId) : undefined;
  const port = city ? activeBuilding(scene, city, "PORT") : undefined;
  return port && cellKey(port.cell) === cellKey(targetCell) ? 0 : 3;
}

export function transportArmyMovementCostAtCell(scene: SceneState, cell: GridCellCoord): number {
  for (const city of scene.strategicCities ?? []) {
    const port = activeBuilding(scene, city, "PORT");
    if (port && cellKey(port.cell) === cellKey(cell)) return 0;
  }
  return 3;
}

export function shipBunkeringBonus(scene: SceneState, cityId: string | null, shipCell: GridCellCoord): number {
  const city = cityId ? (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId) : undefined;
  return city && city.cells.some((candidate) => cellKey(candidate) === cellKey(shipCell)) && activeBuilding(scene, city, "BUNKERING_STATION") ? 2 : 0;
}

export function shipBunkeringBonusAtCell(scene: SceneState, shipCell: GridCellCoord): number {
  return (scene.strategicCities ?? []).some((city) =>
    city.cells.some((candidate) => cellKey(candidate) === cellKey(shipCell)) &&
    Boolean(activeBuilding(scene, city, "BUNKERING_STATION")
  )) ? 2 : 0;
}

export function marineStationAllowsCrossing(scene: SceneState, cityId: string, route: readonly GridCellCoord[]): boolean {
  const city = (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId);
  if (!city || !activeBuilding(scene, city, "MARINE_STATION") || route.length < 3) return false;
  const seaCells = route.filter((cell) => scene.gridMap.cells[cellKey(cell)]?.terrainId === "sea");
  return seaCells.length === 1;
}

export function repairShipAtShipyard(scene: SceneState, ship: ShipState, shipCell: GridCellCoord, amount: number, turnNumber: number): ShipState {
  const city = (scene.strategicCities ?? []).find((candidate) => (candidate.buildings ?? []).some((building) =>
    building.type === "SHIPYARD" && cellKey(building.cell) === cellKey(shipCell)
  ));
  const building = city && (city.buildings ?? []).find((candidate) => candidate.type === "SHIPYARD" && cellKey(candidate.cell) === cellKey(shipCell));
  if (!city || !building || !isCityBuildingActive(city, building, scene.gridMap, scene.states, scene.sides) || ship.status === "IN_NAVAL_BATTLE") return ship;
  const used = ship.repairedOnTurn === turnNumber ? ship.repairedHpThisTurn ?? 0 : 0;
  const hp = Math.min(10 - used, Math.max(0, Math.floor(amount)), Math.max(0, shipEffectiveMaxHp(ship) - ship.hp));
  if (hp <= 0) return ship;
  return { ...ship, hp: ship.hp + hp, repairedHpThisTurn: used + hp, repairedOnTurn: turnNumber, revision: ship.revision + 1 };
}

export function activeShipyardAtCell(scene: SceneState, cityId: string, sideId: string, shipCell: GridCellCoord): boolean {
  const city = (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId);
  const shipyard = city?.buildings?.find((building) => building.type === "SHIPYARD" && cellKey(building.cell) === cellKey(shipCell));
  return Boolean(city && city.factionInfluenceId === sideId && shipyard && isCityBuildingActive(city, shipyard, scene.gridMap, scene.states, scene.sides));
}

export function lighthouseDetectionBonus(scene: SceneState, cityId: string | null, shipCell: GridCellCoord): number {
  const city = cityId ? (scene.strategicCities ?? []).find((candidate) => candidate.id === cityId) : undefined;
  if (!city) return 0;
  const port = activeBuilding(scene, city, "PORT");
  const lighthouse = activeBuilding(scene, city, "LIGHTHOUSE");
  return port && lighthouse && cellKey(port.cell) === cellKey(shipCell) ? 1 : 0;
}

export function lighthouseDetectionBonusAtCell(scene: SceneState, shipCell: GridCellCoord): number {
  return (scene.strategicCities ?? []).some((city) => lighthouseDetectionBonus(scene, city.id, shipCell) > 0) ? 1 : 0;
}

export function seaFortBlocksDisembark(scene: SceneState, targetCell: GridCellCoord, isEnemyTransport: boolean): boolean {
  if (!isEnemyTransport) return false;
  return (scene.strategicCities ?? []).some((city) =>
    city.cells.some((cell) => cellKey(cell) === cellKey(targetCell)) &&
    Boolean(activeBuilding(scene, city, "SEA_FORT"))
  );
}

export function coastalBatteryCanRetaliate(
  scene: SceneState,
  targetCell: GridCellCoord,
  isEnemyShip: boolean,
  retaliatingShipIdsThisRound: ReadonlySet<string>,
  eligibleShipId: string
): boolean {
  if (!isEnemyShip || retaliatingShipIdsThisRound.has(eligibleShipId)) return false;
  return (scene.strategicCities ?? []).some((city) =>
    city.cells.some((cell) => cellKey(cell) === cellKey(targetCell)) &&
    Boolean(activeBuilding(scene, city, "COASTAL_BATTERY"))
  );
}

export function coastalBatteryRetaliationDamage(scene: SceneState, targetCell: GridCellCoord, isEnemyShip: boolean, rollD6: () => number): number {
  if (!isEnemyShip) return 0;
  const active = (scene.strategicCities ?? []).some((city) =>
    city.cells.some((cell) => cellKey(cell) === cellKey(targetCell)) && Boolean(activeBuilding(scene, city, "COASTAL_BATTERY"))
  );
  if (!active) return 0;
  return Math.max(0, Math.floor(rollD6()) + Math.floor(rollD6()));
}

export function canalCellHasBothDomains(scene: SceneState, cell: GridCellCoord): boolean {
  return (scene.strategicCities ?? []).some((city) =>
    (city.buildings ?? []).some((building) => building.type === "CANAL" && cellKey(building.cell) === cellKey(cell) &&
      isCityBuildingActive(city, building, scene.gridMap, scene.states, scene.sides))
  );
}
