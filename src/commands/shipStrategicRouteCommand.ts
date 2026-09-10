import {
  commitShipStrategicRoute,
  planShipStrategicRoute,
  shipStrategicRouteCost
} from "../naval/ships/shipStrategicMovement";
import type { GridCellCoord, ShipFacing, Vector2 } from "../shared/types";
import type { CommandState } from "./commandProcessor";

export interface ShipStrategicRouteCommandInput {
  shipId: string;
  startCell: GridCellCoord;
  cells: readonly GridCellCoord[];
  finalFacing?: ShipFacing;
}

export function applyShipStrategicRouteCommand(
  state: CommandState,
  command: ShipStrategicRouteCommandInput,
  cellForPosition: ((position: Vector2) => GridCellCoord) | undefined
): string | undefined {
  const ship = state.scene.ships?.[command.shipId];
  if (!ship) return "SHIP_NOT_FOUND";
  if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";
  if (ship.hp <= 0) return "SHIP_DESTROYED";
  if (ship.status !== "READY") return "SHIP_NOT_READY";

  const position = state.positions?.[command.shipId] ?? state.items[command.shipId]?.position;
  if (!position || !cellForPosition) return "SHIP_ROUTE_START_MISMATCH";
  const actualStartCell = cellForPosition(position);
  if (
    actualStartCell.x !== command.startCell.x ||
    actualStartCell.y !== command.startCell.y
  ) {
    return "SHIP_ROUTE_START_MISMATCH";
  }

  if (command.cells.length === 0 && (!command.finalFacing || command.finalFacing === ship.facing)) {
    return "INVALID_COMMAND";
  }

  const reservedCost = shipStrategicRouteCost(
    actualStartCell,
    ship.facing,
    ship.plannedRoute,
    ship.plannedFacing
  );
  if (reservedCost === undefined) return "INVALID_COMMAND";
  const editableShip = {
    ...ship,
    plannedRoute: [],
    plannedFacing: null,
    globalMovementRemaining: ship.globalMovementRemaining + reservedCost
  };
  const planned = planShipStrategicRoute(
    state.scene,
    editableShip,
    command.startCell,
    command.cells,
    command.finalFacing
  );
  if (!planned.ok) return planned.reason;

  state.scene.ships = {
    ...state.scene.ships,
    [command.shipId]: commitShipStrategicRoute(
      editableShip,
      planned.cells,
      planned.cost,
      command.finalFacing
    )
  };
  return undefined;
}
