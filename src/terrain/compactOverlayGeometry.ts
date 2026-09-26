import type { GridCellCoord } from "../shared/types";

export interface StyledCell {
  cell: GridCellCoord;
  styleKey: string;
}

export interface CellRectangle {
  styleKey: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface HorizontalRun {
  minX: number;
  maxX: number;
}

function horizontalRuns(xs: ReadonlySet<number>): HorizontalRun[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const runs: HorizontalRun[] = [];
  for (const x of sorted) {
    const last = runs.at(-1);
    if (last && x <= last.maxX + 1) {
      last.maxX = Math.max(last.maxX, x);
    } else {
      runs.push({ minX: x, maxX: x });
    }
  }
  return runs;
}

export function compactCellRectangles(cells: readonly StyledCell[]): CellRectangle[] {
  const rowsByStyle = new Map<string, Map<number, Set<number>>>();
  for (const { cell, styleKey } of cells) {
    let rows = rowsByStyle.get(styleKey);
    if (!rows) {
      rows = new Map();
      rowsByStyle.set(styleKey, rows);
    }
    let xs = rows.get(cell.y);
    if (!xs) {
      xs = new Set();
      rows.set(cell.y, xs);
    }
    xs.add(cell.x);
  }

  const rectangles: CellRectangle[] = [];
  for (const [styleKey, rows] of rowsByStyle) {
    let active = new Map<string, CellRectangle>();
    let previousY: number | undefined;

    for (const [y, xs] of [...rows.entries()].sort(([a], [b]) => a - b)) {
      if (previousY === undefined || y !== previousY + 1) {
        rectangles.push(...active.values());
        active = new Map();
      }

      const next = new Map<string, CellRectangle>();
      for (const run of horizontalRuns(xs)) {
        const runKey = `${run.minX},${run.maxX}`;
        const existing = active.get(runKey);
        next.set(runKey, existing
          ? { ...existing, maxY: y }
          : { styleKey, minX: run.minX, minY: y, maxX: run.maxX, maxY: y });
      }
      for (const [runKey, rectangle] of active) {
        if (!next.has(runKey)) rectangles.push(rectangle);
      }
      active = next;
      previousY = y;
    }
    rectangles.push(...active.values());
  }

  return rectangles.sort((a, b) =>
    a.styleKey.localeCompare(b.styleKey)
    || a.minY - b.minY
    || a.minX - b.minX
    || a.maxY - b.maxY
    || a.maxX - b.maxX
  );
}
