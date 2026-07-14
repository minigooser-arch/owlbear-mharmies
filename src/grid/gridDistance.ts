import type { GridDistancePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";

export interface GridSdkPort {
  getGridDistance(from: Vector2, to: Vector2): Promise<number>;
  onGridChange(callback: () => void): () => void;
}

export class GridDistanceService implements GridDistancePort {
  constructor(private readonly sdk: GridSdkPort) {}

  async distance(from: Vector2, to: Vector2): Promise<number> {
    return this.sdk.getGridDistance(from, to);
  }

  subscribe(onInvalidated: () => void): () => void {
    return this.sdk.onGridChange(onInvalidated);
  }
}
