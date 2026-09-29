import { parseCellKey } from "../grid/strategicGrid";
import { METADATA_KEYS } from "../shared/constants";
import type { GridCellCoord } from "../shared/types";
import type { DesiredLocalOverlay } from "../owlbear/localOverlayReconciler";

export interface GridCellBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FogObserver {
  cell: GridCellCoord;
  rangeCells: number;
}

export interface FogOfWarOverlaySource {
  dpi: number;
  bounds: GridCellBounds;
  observers: readonly FogObserver[];
}

export function deriveGridBounds(
  cells: Readonly<Record<string, unknown>>
): GridCellBounds | undefined {
  let bounds: GridCellBounds | undefined;
  for (const rawKey of Object.keys(cells)) {
    let cell: GridCellCoord;
    try {
      cell = parseCellKey(rawKey);
    } catch {
      continue;
    }
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, cell.x),
          maxX: Math.max(bounds.maxX, cell.x),
          minY: Math.min(bounds.minY, cell.y),
          maxY: Math.max(bounds.maxY, cell.y)
        }
      : { minX: cell.x, maxX: cell.x, minY: cell.y, maxY: cell.y };
  }
  return bounds;
}

interface FogRectangle {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function revealedCell(
  x: number,
  y: number,
  observers: readonly FogObserver[]
): boolean {
  return observers.some((observer) => {
    if (!Number.isFinite(observer.rangeCells) || observer.rangeCells < 0) return false;
    const dx = x - observer.cell.x;
    const dy = y - observer.cell.y;
    const radius = observer.rangeCells + 0.5;
    return dx * dx + dy * dy <= radius * radius;
  });
}

function fogRectangles(source: FogOfWarOverlaySource): FogRectangle[] {
  const { minX, maxX, minY, maxY } = source.bounds;
  const observers = source.observers;
  const active = new Map<string, FogRectangle>();
  const finished: FogRectangle[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    const runs: Array<[number, number]> = [];
    let runStart: number | undefined;
    for (let x = minX; x <= maxX + 1; x += 1) {
      const fogged = x <= maxX && !revealedCell(x, y, observers);
      if (fogged && runStart === undefined) runStart = x;
      if (!fogged && runStart !== undefined) {
        runs.push([runStart, x - 1]);
        runStart = undefined;
      }
    }

    const next = new Map<string, FogRectangle>();
    for (const [runMinX, runMaxX] of runs) {
      const key = `${runMinX},${runMaxX}`;
      const previous = active.get(key);
      if (previous && previous.maxY === y - 1) {
        previous.maxY = y;
        next.set(key, previous);
      } else {
        next.set(key, { minX: runMinX, maxX: runMaxX, minY: y, maxY: y });
      }
    }
    for (const [key, rectangle] of active) {
      if (!next.has(key)) finished.push(rectangle);
    }
    active.clear();
    for (const [key, rectangle] of next) active.set(key, rectangle);
  }
  finished.push(...active.values());
  return finished;
}

function rectanglePoints(rectangle: FogRectangle, dpi: number) {
  const minX = rectangle.minX * dpi;
  const minY = rectangle.minY * dpi;
  const maxX = (rectangle.maxX + 1) * dpi;
  const maxY = (rectangle.maxY + 1) * dpi;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY }
  ];
}

export function buildFogOfWarOverlays(source: FogOfWarOverlaySource): DesiredLocalOverlay[] {
  return fogRectangles(source).map((rectangle) => {
    const key = `FOG_OF_WAR/${rectangle.minX},${rectangle.minY}/${rectangle.maxX},${rectangle.maxY}`;
    return {
      key,
      item: {
        type: "CURVE",
        name: "Туман войны",
        position: { x: 0, y: 0 },
        points: rectanglePoints(rectangle, source.dpi),
        rotation: 0,
        scale: { x: 1, y: 1 },
        layer: "FOG",
        zIndex: 0,
        visible: true,
        locked: true,
        disableHit: true,
        disableAutoZIndex: true,
        // Use a transparent stroke as a second line of defence: some Owlbear
        // renderers keep a default curve outline even when opacity is zero.
        strokeColor: "rgba(107,114,128,0)",
        strokeOpacity: 0,
        strokeWidth: 0,
        fillColor: "#808080",
        fillOpacity: 0.2,
        metadata: {
          [METADATA_KEYS.mapOverlay]: { key, kind: "FOG_OF_WAR" }
        }
      }
    };
  });
}
