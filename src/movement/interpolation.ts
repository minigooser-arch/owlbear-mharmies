import type { Vector2 } from "../shared/types";

export function interpolatePosition(from: Vector2, to: Vector2, progress: number): Vector2 {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t
  };
}

export function isSleepGap(deltaSeconds: number): boolean {
  return deltaSeconds > 3;
}
