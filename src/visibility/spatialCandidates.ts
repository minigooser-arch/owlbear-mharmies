import type { Vector2 } from "../shared/types";

export interface SpatialUnit {
  position: Vector2;
  detectionRangeCells: number;
  concealmentCells?: number;
}

/**
 * Conservative broad phase for SQUARE Owlbear grids only.
 *
 * It never determines visibility: actual SDK grid distance and barrier
 * intersection remain authoritative. Extra four cells cover edge-to-edge
 * token positions and rounding in integer grid measurements.
 *
 * Other grid types are excluded by the calling code. Unknown grid settings,
 * non-finite positions/ranges, and overly broad queries fall back to the
 * exhaustive set of candidates.
 */
export function squareGridCandidates<T extends SpatialUnit>(
  units: readonly T[],
  dpi: number
): (observer: T) => readonly number[] {
  const all = units.map((_, index) => index);
  if (!(Number.isFinite(dpi) && dpi > 0)) return () => all;
  if (units.some(({ position }) => !Number.isFinite(position.x) || !Number.isFinite(position.y))) {
    return () => all;
  }
  const cellSize = dpi * 8;
  const bins = new Map<string, number[]>();
  const minConcealment = Math.min(0, ...units.map(unit => unit.concealmentCells ?? 0));
  if (!Number.isFinite(minConcealment)) return () => all;
  for (const [index, unit] of units.entries()) {
    const x = Math.floor(unit.position.x / cellSize);
    const y = Math.floor(unit.position.y / cellSize);
    const key = `${x},${y}`;
    const bucket = bins.get(key) ?? [];
    bucket.push(index);
    bins.set(key, bucket);
  }

  return (observer) => {
    const effective = observer.detectionRangeCells - minConcealment;
    if (!Number.isFinite(effective) || effective < 0) return all;
    const radius = (effective + 4) * dpi;
    const fromX = Math.floor((observer.position.x - radius) / cellSize);
    const toX = Math.floor((observer.position.x + radius) / cellSize);
    const fromY = Math.floor((observer.position.y - radius) / cellSize);
    const toY = Math.floor((observer.position.y + radius) / cellSize);
    const width = toX - fromX + 1;
    const height = toY - fromY + 1;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 1 || height < 1 || width * height > units.length * 4) return all;

    const candidates: number[] = [];
    for (let y = fromY; y <= toY; y += 1) {
      for (let x = fromX; x <= toX; x += 1) {
        const bucket = bins.get(`${x},${y}`);
        if (bucket) candidates.push(...bucket);
      }
    }
    // Equivalent pair order to the exhaustive observer/target loops.
    return candidates.sort((a, b) => a - b);
  };
}
