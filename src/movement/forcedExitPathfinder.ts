import { cellKey } from "../grid/strategicGrid";
import type { GridCellCoord } from "../shared/types";

export interface ForcedExitPathfinderInput {
  start: GridCellCoord;
  cells: readonly GridCellCoord[];
  canTraverse(cell: GridCellCoord): boolean;
  isLegalDestination(cell: GridCellCoord): boolean;
  maxRoutes?: number;
}

const DIRECTIONS = [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}] as const;

export function findShortestForcedExitRoutes(input: ForcedExitPathfinderInput): GridCellCoord[][] {
  const available = new Map(input.cells.map((cell) => [cellKey(cell), {...cell}]));
  const startKey = cellKey(input.start);
  available.set(startKey, {...input.start});
  const distance = new Map<string, number>([[startKey, 0]]);
  const parents = new Map<string, string[]>();
  const queue = [startKey];
  let head = 0;
  let exitDistance: number | null = null;
  const exits: string[] = [];

  while (head < queue.length) {
    const currentKey = queue[head++];
    if (!currentKey) break;
    const current = available.get(currentKey);
    const currentDistance = distance.get(currentKey);
    if (!current || currentDistance === undefined || (exitDistance !== null && currentDistance >= exitDistance)) continue;
    for (const delta of DIRECTIONS) {
      const neighbor = {x:current.x + delta.x, y:current.y + delta.y};
      const key = cellKey(neighbor);
      if (!available.has(key) || !input.canTraverse(neighbor)) continue;
      const nextDistance = currentDistance + 1;
      const known = distance.get(key);
      if (known === undefined) {
        distance.set(key, nextDistance);
        parents.set(key, [currentKey]);
        queue.push(key);
        if (input.isLegalDestination(neighbor)) {
          exitDistance = nextDistance;
          exits.push(key);
        }
      } else if (known === nextDistance) {
        parents.get(key)?.push(currentKey);
      }
    }
  }

  const maxRoutes = input.maxRoutes ?? 100;
  const routes: GridCellCoord[][] = [];
  const build = (key: string, reversePath: string[]): void => {
    if (routes.length >= maxRoutes) return;
    if (key === startKey) {
      routes.push(reversePath.slice(0, -1).reverse().map((pathKey) => ({...available.get(pathKey)} as GridCellCoord)));
      return;
    }
    for (const parent of parents.get(key) ?? []) build(parent, [...reversePath, parent]);
  };
  for (const exit of exits) build(exit, [exit]);
  return routes;
}
