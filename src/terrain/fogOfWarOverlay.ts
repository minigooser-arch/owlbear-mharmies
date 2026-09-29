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

function xml(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function maskSvg(source: FogOfWarOverlaySource): string {
  const width = source.bounds.maxX - source.bounds.minX + 1;
  const height = source.bounds.maxY - source.bounds.minY + 1;
  const holes = source.observers
    .filter((observer) => Number.isFinite(observer.rangeCells) && observer.rangeCells >= 0)
    .map((observer) => {
      const cx = observer.cell.x - source.bounds.minX + 0.5;
      const cy = observer.cell.y - source.bounds.minY + 0.5;
      return `<circle cx="${xml(cx)}" cy="${xml(cy)}" r="${xml(observer.rangeCells + 0.5)}" fill="black"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${xml(width)}" height="${xml(height)}" viewBox="0 0 ${xml(width)} ${xml(height)}"><defs><mask id="fog-mask" maskUnits="userSpaceOnUse"><rect width="${xml(width)}" height="${xml(height)}" fill="white"/>${holes}</mask></defs><rect width="${xml(width)}" height="${xml(height)}" fill="#6b7280" fill-opacity="0.58" mask="url(#fog-mask)"/></svg>`;
}

export function buildFogOfWarOverlay(source: FogOfWarOverlaySource): DesiredLocalOverlay {
  const widthCells = source.bounds.maxX - source.bounds.minX + 1;
  const heightCells = source.bounds.maxY - source.bounds.minY + 1;
  const width = widthCells * source.dpi;
  const height = heightCells * source.dpi;
  const key = "FOG_OF_WAR";
  return {
    key,
    item: {
      type: "IMAGE",
      name: "Туман войны",
      position: {
        x: (source.bounds.minX + source.bounds.maxX + 1) * source.dpi / 2,
        y: (source.bounds.minY + source.bounds.maxY + 1) * source.dpi / 2
      },
      rotation: 0,
      scale: { x: 1, y: 1 },
      layer: "FOG",
      zIndex: 0,
      visible: true,
      locked: true,
      disableHit: true,
      disableAutoZIndex: true,
      image: {
        width,
        height,
        mime: "image/svg+xml",
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(maskSvg(source))}`
      },
      grid: { dpi: source.dpi, offset: { x: 0, y: 0 } },
      metadata: {
        [METADATA_KEYS.mapOverlay]: { key, kind: "FOG_OF_WAR" }
      }
    }
  };
}
