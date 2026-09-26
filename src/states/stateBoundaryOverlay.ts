import { cellKey, parseCellKey } from "../grid/strategicGrid";
import type { GridMapState, StateEntity, Vector2 } from "../shared/types";

export interface StateBoundarySegment {
  stateId: string;
  from: Vector2;
  to: Vector2;
  color: string;
}

interface SegmentRange {
  start: number;
  end: number;
}

export function compactBoundarySegments(segments: readonly StateBoundarySegment[]): StateBoundarySegment[] {
  const groups = new Map<string, {
    stateId: string;
    color: string;
    orientation: "H" | "V";
    fixed: number;
    ranges: SegmentRange[];
  }>();
  const passthrough: StateBoundarySegment[] = [];

  for (const segment of segments) {
    const horizontal = segment.from.y === segment.to.y;
    const vertical = segment.from.x === segment.to.x;
    if (!horizontal && !vertical) {
      const forward = segment.from.y < segment.to.y
        || (segment.from.y === segment.to.y && segment.from.x <= segment.to.x);
      passthrough.push(forward ? { ...segment } : { ...segment, from: segment.to, to: segment.from });
      continue;
    }

    const orientation = horizontal ? "H" : "V";
    const fixed = horizontal ? segment.from.y : segment.from.x;
    const start = horizontal
      ? Math.min(segment.from.x, segment.to.x)
      : Math.min(segment.from.y, segment.to.y);
    const end = horizontal
      ? Math.max(segment.from.x, segment.to.x)
      : Math.max(segment.from.y, segment.to.y);
    const groupKey = JSON.stringify([segment.stateId, segment.color, orientation, fixed]);
    let group = groups.get(groupKey);
    if (!group) {
      group = { stateId: segment.stateId, color: segment.color, orientation, fixed, ranges: [] };
      groups.set(groupKey, group);
    }
    group.ranges.push({ start, end });
  }

  const compacted = [...passthrough];
  for (const group of groups.values()) {
    const sorted = group.ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: SegmentRange[] = [];
    for (const range of sorted) {
      const last = merged.at(-1);
      if (last && range.start <= last.end) {
        last.end = Math.max(last.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
    for (const range of merged) {
      compacted.push({
        stateId: group.stateId,
        color: group.color,
        from: group.orientation === "H"
          ? { x: range.start, y: group.fixed }
          : { x: group.fixed, y: range.start },
        to: group.orientation === "H"
          ? { x: range.end, y: group.fixed }
          : { x: group.fixed, y: range.end }
      });
    }
  }

  return compacted.sort((a, b) =>
    a.from.y - b.from.y
    || a.from.x - b.from.x
    || a.to.y - b.to.y
    || a.to.x - b.to.x
    || a.stateId.localeCompare(b.stateId)
    || a.color.localeCompare(b.color)
  );
}

interface BoundaryEdge {
  neighborDx: number;
  neighborDy: number;
  from(x: number, y: number, dpi: number): Vector2;
  to(x: number, y: number, dpi: number): Vector2;
}

const EDGES: readonly BoundaryEdge[] = [
  {
    neighborDx: 0,
    neighborDy: -1,
    from: (x, y, dpi) => ({ x: x * dpi, y: y * dpi }),
    to: (x, y, dpi) => ({ x: (x + 1) * dpi, y: y * dpi })
  },
  {
    neighborDx: 1,
    neighborDy: 0,
    from: (x, y, dpi) => ({ x: (x + 1) * dpi, y: y * dpi }),
    to: (x, y, dpi) => ({ x: (x + 1) * dpi, y: (y + 1) * dpi })
  },
  {
    neighborDx: 0,
    neighborDy: 1,
    from: (x, y, dpi) => ({ x: x * dpi, y: (y + 1) * dpi }),
    to: (x, y, dpi) => ({ x: (x + 1) * dpi, y: (y + 1) * dpi })
  },
  {
    neighborDx: -1,
    neighborDy: 0,
    from: (x, y, dpi) => ({ x: x * dpi, y: y * dpi }),
    to: (x, y, dpi) => ({ x: x * dpi, y: (y + 1) * dpi })
  }
];

export function buildStateBoundarySegments(
  gridMap: GridMapState,
  states: readonly StateEntity[],
  dpi: number,
  controlField: "recognizedStateId" | "deFactoStateId" = "recognizedStateId"
): StateBoundarySegment[] {
  const fields = buildStateBoundarySegmentsForFields(gridMap, states, dpi);
  return controlField === "recognizedStateId" ? fields.recognized : fields.deFacto;
}

export function buildStateBoundarySegmentsForFields(
  gridMap: GridMapState,
  states: readonly StateEntity[],
  dpi: number
): { recognized: StateBoundarySegment[]; deFacto: StateBoundarySegment[] } {
  const empty = { recognized: [], deFacto: [] };
  if (!Number.isFinite(dpi) || dpi <= 0) return empty;
  const statesById = new Map(states.map((state) => [state.id, state]));
  const segments = { recognized: [] as StateBoundarySegment[], deFacto: [] as StateBoundarySegment[] };
  const fields = [
    ["recognizedStateId", segments.recognized],
    ["deFactoStateId", segments.deFacto]
  ] as const;
  const cells = Object.entries(gridMap.cells).sort(([a], [b]) => a.localeCompare(b)).flatMap(([rawKey, cell]) => {
    try { return [{ cell, coordinate: parseCellKey(rawKey) }]; } catch { return []; }
  });

  for (const { cell, coordinate } of cells) {
    for (const [controlField, output] of fields) {
      const stateId = cell[controlField];
      if (!stateId) continue;
      const state = statesById.get(stateId);
      if (!state) continue;
      for (const edge of EDGES) {
        const neighbor = gridMap.cells[cellKey({
          x: coordinate.x + edge.neighborDx,
          y: coordinate.y + edge.neighborDy
        })];
        if (neighbor?.[controlField] === state.id) continue;
        output.push({
          stateId: state.id,
          from: edge.from(coordinate.x, coordinate.y, dpi),
          to: edge.to(coordinate.x, coordinate.y, dpi),
          color: state.color ?? "#607d8b"
        });
      }
    }
  }

  return segments;
}
