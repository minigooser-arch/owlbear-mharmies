import type { GridCellCoord, ShipState } from "../../shared/types";

export function sameShipCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

export function occupiedByOtherLiveShip(
  ships: Readonly<Record<string, ShipState>>,
  cellsByShipId: Readonly<Record<string, GridCellCoord | undefined>>,
  movingShipId: string,
  targetCell: GridCellCoord
): boolean {
  return Object.entries(ships).some(([shipId, ship]) => {
    if (shipId === movingShipId || ship.hp <= 0) return false;
    const cell = cellsByShipId[shipId];
    return cell !== undefined && sameShipCell(cell, targetCell);
  });
}

export function hasDuplicateLiveShipCells(
  ships: Readonly<Record<string, ShipState>>,
  finalCellsByShipId: Readonly<Record<string, GridCellCoord | undefined>>
): boolean {
  const occupied = new Set<string>();
  for (const [shipId, ship] of Object.entries(ships)) {
    if (ship.hp <= 0) continue;
    const cell = finalCellsByShipId[shipId];
    if (!cell) continue;
    const key = `${cell.x},${cell.y}`;
    if (occupied.has(key)) return true;
    occupied.add(key);
  }
  return false;
}
