import {
  MINECRAFT_GRID_TOP_RIGHT,
  STRATEGIC_CELL_BLOCKS
} from "../shared/constants";
import type { GridCellCoord, Vector2 } from "../shared/types";

export interface OwlbearGridGeometry {
  dpi: number;
  offset: Vector2;
}

export interface MinecraftCellBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function cellKey(cell: GridCellCoord): string {
  return `${cell.x},${cell.y}`;
}

export function parseCellKey(key: string): GridCellCoord {
  const [xRaw, yRaw] = key.split(",", 2);
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Invalid strategic cell key: ${key}`);
  }
  return { x, y };
}

export function isOrthogonalNeighbor(from: GridCellCoord, to: GridCellCoord): boolean {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) === 1;
}

/**
 * Strategic cells intentionally follow the Owlbear grid. One Owlbear grid cell is one
 * strategic 10x10-chunk cell. The Minecraft anchor is kept separately so changing the
 * world border later doesn't change the route domain API.
 */
export class StrategicGridAdapter {
  constructor(private readonly geometry: OwlbearGridGeometry) {
    if (!(geometry.dpi > 0) || !Number.isFinite(geometry.dpi)) {
      throw new Error("Strategic grid DPI must be positive");
    }
  }

  sceneToCell(position: Vector2): GridCellCoord {
    return {
      x: Math.floor((position.x - this.geometry.offset.x) / this.geometry.dpi),
      y: Math.floor((position.y - this.geometry.offset.y) / this.geometry.dpi)
    };
  }

  cellToSceneCenter(cell: GridCellCoord): Vector2 {
    return {
      x: this.geometry.offset.x + (cell.x + 0.5) * this.geometry.dpi,
      y: this.geometry.offset.y + (cell.y + 0.5) * this.geometry.dpi
    };
  }
}

/**
 * Cell (0,0) has its north-east/top-right corner at Minecraft (0, -10000).
 * Positive strategic X goes left/west on the map; positive strategic Y goes down/south.
 */
export function minecraftCellBounds(cell: GridCellCoord): MinecraftCellBounds {
  const maxX = MINECRAFT_GRID_TOP_RIGHT.x - cell.x * STRATEGIC_CELL_BLOCKS;
  const minX = maxX - STRATEGIC_CELL_BLOCKS + 1;
  const minZ = MINECRAFT_GRID_TOP_RIGHT.z + cell.y * STRATEGIC_CELL_BLOCKS;
  const maxZ = minZ + STRATEGIC_CELL_BLOCKS - 1;
  return { minX, maxX, minZ, maxZ };
}
