import type { Vector2 } from "./types";

export const GEOMETRY_EPSILON = 1e-7;

export interface Segment {
  from: Vector2;
  to: Vector2;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SegmentIntersection {
  point: Vector2;
  t: number;
  u: number;
}

function cross(left: Vector2, right: Vector2): number {
  return left.x * right.y - left.y * right.x;
}

function subtract(left: Vector2, right: Vector2): Vector2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

function pointAt(segment: Segment, t: number): Vector2 {
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t
  };
}

function parameterForPoint(segment: Segment, point: Vector2): number {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > GEOMETRY_EPSILON) {
    return (point.x - segment.from.x) / dx;
  }
  if (Math.abs(dy) > GEOMETRY_EPSILON) return (point.y - segment.from.y) / dy;
  return 0;
}

export function segmentIntersection(
  movement: Segment,
  barrier: Segment
): SegmentIntersection | undefined {
  const r = subtract(movement.to, movement.from);
  const s = subtract(barrier.to, barrier.from);
  const offset = subtract(barrier.from, movement.from);
  const denominator = cross(r, s);
  const collinearity = cross(offset, r);

  if (Math.abs(denominator) <= GEOMETRY_EPSILON) {
    if (Math.abs(collinearity) > GEOMETRY_EPSILON) return undefined;
    const rLengthSquared = r.x * r.x + r.y * r.y;
    if (rLengthSquared <= GEOMETRY_EPSILON) {
      const u = parameterForPoint(barrier, movement.from);
      return u >= -GEOMETRY_EPSILON && u <= 1 + GEOMETRY_EPSILON
        ? { point: { ...movement.from }, t: 0, u: Math.max(0, Math.min(1, u)) }
        : undefined;
    }
    const start = (offset.x * r.x + offset.y * r.y) / rLengthSquared;
    const barrierVector = subtract(barrier.to, movement.from);
    const end = (barrierVector.x * r.x + barrierVector.y * r.y) / rLengthSquared;
    const overlapStart = Math.max(0, Math.min(start, end));
    const overlapEnd = Math.min(1, Math.max(start, end));
    if (overlapStart > overlapEnd + GEOMETRY_EPSILON) return undefined;
    const t = Math.max(0, Math.min(1, overlapStart));
    const point = pointAt(movement, t);
    return { point, t, u: Math.max(0, Math.min(1, parameterForPoint(barrier, point))) };
  }

  const t = cross(offset, s) / denominator;
  const u = cross(offset, r) / denominator;
  if (
    t < -GEOMETRY_EPSILON ||
    t > 1 + GEOMETRY_EPSILON ||
    u < -GEOMETRY_EPSILON ||
    u > 1 + GEOMETRY_EPSILON
  ) {
    return undefined;
  }
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    point: pointAt(movement, clampedT),
    t: clampedT,
    u: Math.max(0, Math.min(1, u))
  };
}

export function segmentsIntersect(left: Segment, right: Segment): boolean {
  return segmentIntersection(left, right) !== undefined;
}

export function boundingBox(segment: Segment): BoundingBox {
  return {
    minX: Math.min(segment.from.x, segment.to.x),
    minY: Math.min(segment.from.y, segment.to.y),
    maxX: Math.max(segment.from.x, segment.to.x),
    maxY: Math.max(segment.from.y, segment.to.y)
  };
}

export function boundingBoxesIntersect(left: BoundingBox, right: BoundingBox): boolean {
  return !(
    left.maxX < right.minX - GEOMETRY_EPSILON ||
    right.maxX < left.minX - GEOMETRY_EPSILON ||
    left.maxY < right.minY - GEOMETRY_EPSILON ||
    right.maxY < left.minY - GEOMETRY_EPSILON
  );
}
