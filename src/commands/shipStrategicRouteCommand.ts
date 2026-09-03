import { commitShipStrategicRoute, planShipStrategicRoute } from "../naval/ships/shipStrategicMovement";
import type { GridCellCoord, Vector2 } from "../shared/types";
import type { CommandState } from "./commandProcessor";

export interface ShipStrategicRouteCommandInput {
  shipId: string;
  startCell: GridCellCoord;
  cells: readonly GridCellCoord[];
}

export function applyShipStrategicRouteCommand(
  state: CommandState,
  command: ShipStrategicRouteCommandInput,
  cellForPosition: ((position: Vector2) => GridCellCoord) | undefined
): string | undefined {
  const ship = state.scene.ships?.[command.shipId];
  if (!ship) return "SHIP_NOT_FOUND";
  if (ship.status !== "READY") return "SHIP_NOT_READY";
  if (ship.plannedRoute.length > 0) return "SHIP_ROUTE_ALREADY_PLANNED";

  const position = state.positions?.[command.shipId] ?? state.items[command.shipId]?.position;
  if (!position || !cellForPosition) return "SHIP_ROUTE_START_MISMATCH";
  const actualStartCell = cellForPosition(position);
  if (
    actualStartCell.x !== command.startCell.x ||
    actualStartCell.y !== command.startCell.y
  ) {
    return "SHIP_ROUTE_START_MISMATCH";
  }

  const planned = planShipStrategicRoute(state.scene, ship, command.startCell, command.cells);
  if (!planned.ok) return planned.reason;

  state.scene.ships = {
    ...state.scene.ships,
    [command.shipId]: commitShipStrategicRoute(ship, planned.cells)
  };
  return undefined;
}
