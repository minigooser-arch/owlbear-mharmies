import type { GridCellCoord, SceneItemRecord, SceneState, Vector2 } from "../../shared/types";
import { SHIP_CLASSES } from "./shipClasses";
import { planShipStrategicRoute, type ShipStrategicMovementFailure } from "./shipStrategicMovement";

export type ShipMovementPhaseResult =
  | { ok: true }
  | { ok: false; reason: ShipStrategicMovementFailure | "SHIP_POSITION_UNAVAILABLE" };

interface ResolvedShipRoute {
  shipId: string;
  finalCell?: GridCellCoord;
  finalFacing: NonNullable<SceneState["ships"]>[string]["facing"];
}

export function resolvePlannedShipRoutes(
  scene: SceneState,
  items: Readonly<Record<string, SceneItemRecord>>,
  positions: Record<string, Vector2>,
  cellForPosition: ((position: Vector2) => GridCellCoord) | undefined,
  positionForCell: ((cell: GridCellCoord) => Vector2) | undefined
): ShipMovementPhaseResult {
  const ships = scene.ships ?? {};
  const plannedShips = Object.entries(ships).filter(
    ([, ship]) => ship.plannedRoute.length > 0 || ship.plannedFacing != null
  );
  if (plannedShips.length === 0) return { ok: true };

  const resolved: ResolvedShipRoute[] = [];
  for (const [shipId, ship] of plannedShips) {
    let startCell: GridCellCoord = { x: 0, y: 0 };
    if (ship.plannedRoute.length > 0) {
      const position = positions[shipId] ?? items[shipId]?.position;
      if (!position || !cellForPosition || !positionForCell) {
        return { ok: false, reason: "SHIP_POSITION_UNAVAILABLE" };
      }
      startCell = cellForPosition(position);
    }
    const validationShip = {
      ...ship,
      globalMovementRemaining: SHIP_CLASSES[ship.classId].movement
    };
    const planned = planShipStrategicRoute(
      scene,
      validationShip,
      startCell,
      ship.plannedRoute,
      ship.plannedFacing
    );
    if (!planned.ok) return { ok: false, reason: planned.reason };
    const finalCell = planned.cells.at(-1);
    resolved.push({
      shipId,
      ...(finalCell ? { finalCell: { ...finalCell } } : {}),
      finalFacing: planned.finalFacing
    });
  }

  for (const route of resolved) {
    const ship = ships[route.shipId];
    if (!ship) continue;
    if (route.finalCell) {
      if (!positionForCell) return { ok: false, reason: "SHIP_POSITION_UNAVAILABLE" };
      positions[route.shipId] = positionForCell(route.finalCell);
    }
    ships[route.shipId] = {
      ...ship,
      facing: route.finalFacing,
      plannedRoute: [],
      plannedFacing: null,
      revision: ship.revision + 1
    };
  }
  scene.ships = ships;
  return { ok: true };
}
