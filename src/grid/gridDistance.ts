import type { GridRoutePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";

export interface GridSdkPort {
  getGridDistance(from: Vector2, to: Vector2): Promise<number>;
  snapGridCenter(position: Vector2): Promise<Vector2>;
  getGridDpi(): Promise<number>;
  getGridType?(): Promise<string>;
  onGridChange(callback: () => void): () => void;
}

export class GridDistanceService implements GridRoutePort {
  constructor(private readonly sdk: GridSdkPort) {}

  async distance(from: Vector2, to: Vector2): Promise<number> {
    return this.sdk.getGridDistance(from, to);
  }

  async snapGridCenter(position: Vector2): Promise<Vector2> {
    return this.sdk.snapGridCenter(position);
  }

  async getDpi(): Promise<number> {
    return this.sdk.getGridDpi();
  }

  /**
   * Spatial filtering is safe only for the square grid where pixel-space
   * axes map directly to grid-cell dimensions. Unknown types fall back to
   * Owlbear's exact distance calculation for every pair.
   */
  async getSquareGridDpi(): Promise<number | undefined> {
    if (!this.sdk.getGridType) return undefined;
    try {
      const [gridType, dpi] = await Promise.all([
        this.sdk.getGridType(), this.sdk.getGridDpi()
      ]);
      return gridType === "SQUARE" && Number.isFinite(dpi) && dpi > 0
        ? dpi
        : undefined;
    } catch {
      return undefined;
    }
  }

  subscribe(onInvalidated: () => void): () => void {
    return this.sdk.onGridChange(onInvalidated);
  }
}
