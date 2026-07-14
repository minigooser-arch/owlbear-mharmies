import {
  boundingBox,
  boundingBoxesIntersect,
  segmentIntersection,
  type BoundingBox,
  type Segment
} from "../shared/geometry";
import type { Vector2 } from "../shared/types";

export interface BarrierSegment extends Segment {
  barrierId: string;
}

export interface BarrierIntersection {
  barrierId: string;
  point: Vector2;
  t: number;
}

export function firstBarrierIntersection(
  movement: Segment,
  barriers: readonly BarrierSegment[]
): BarrierIntersection | undefined {
  let first: BarrierIntersection | undefined;
  for (const barrier of barriers) {
    const intersection = segmentIntersection(movement, barrier);
    if (!intersection || (first && first.t <= intersection.t)) continue;
    first = {
      barrierId: barrier.barrierId,
      point: intersection.point,
      t: intersection.t
    };
  }
  return first;
}

interface IndexedSegment {
  segment: BarrierSegment;
  bounds: BoundingBox;
}

export class BarrierSegmentIndex {
  private readonly entries: IndexedSegment[];

  constructor(segments: readonly BarrierSegment[]) {
    this.entries = segments.map((segment) => ({ segment, bounds: boundingBox(segment) }));
  }

  query(movement: Segment): BarrierSegment[] {
    const bounds = boundingBox(movement);
    return this.entries
      .filter((entry) => boundingBoxesIntersect(bounds, entry.bounds))
      .map((entry) => entry.segment);
  }
}

export function segmentsFromPolyline(barrierId: string, points: readonly Vector2[]): BarrierSegment[] {
  const segments: BarrierSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from && to) segments.push({ barrierId, from, to });
  }
  return segments;
}
