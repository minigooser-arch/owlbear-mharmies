import type { GridRoutePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";

export interface GridSdkPort {
  getGridDistance(from: Vector2, to: Vector2): Promise<number>;
  snapGridCenter(position: Vector2): Promise<Vector2>;
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

  subscribe(onInvalidated: () => void): () => void {
    return this.sdk.onGridChange(onInvalidated);
  }
}
