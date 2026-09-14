import { cellKey, parseCellKey } from "../grid/strategicGrid";
import type { GridMapState, StateEntity, Vector2 } from "../shared/types";

export interface StateBoundarySegment {
  stateId: string;
  from: Vector2;
  to: Vector2;
  color: string;
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
  dpi: number
): StateBoundarySegment[] {
  if (!Number.isFinite(dpi) || dpi <= 0) return [];
  const statesById = new Map(states.map((state) => [state.id, state]));
  const segments: StateBoundarySegment[] = [];

  for (const [rawKey, cell] of Object.entries(gridMap.cells).sort(([a], [b]) => a.localeCompare(b))) {
    if (!cell.recognizedStateId) continue;
    const state = statesById.get(cell.recognizedStateId);
    if (!state) continue;

    let coordinate;
    try {
      coordinate = parseCellKey(rawKey);
    } catch {
      continue;
    }

    for (const edge of EDGES) {
      const neighbor = gridMap.cells[cellKey({
        x: coordinate.x + edge.neighborDx,
        y: coordinate.y + edge.neighborDy
      })];
      if (neighbor?.recognizedStateId === state.id) continue;
      segments.push({
        stateId: state.id,
        from: edge.from(coordinate.x, coordinate.y, dpi),
        to: edge.to(coordinate.x, coordinate.y, dpi),
        color: state.color ?? "#607d8b"
      });
    }
  }

  return segments;
}
