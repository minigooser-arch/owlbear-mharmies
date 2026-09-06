import type { GridCellCoord, ShipState } from "../../shared/types";

export interface NavalDetectionShip {
  id: string;
  sideId: string;
  cell: GridCellCoord;
  state: Pick<ShipState, "detectionOverride">;
}

export interface NavalDetectionGraph {
  visibleTargetsBySide: Map<string, Set<string>>;
  observersBySide: Map<string, Map<string, Set<string>>>;
}

export interface NavalDetectionInput {
  ships: readonly NavalDetectionShip[];
  baseDetectionRangeCells: number;
  distanceCells(from: GridCellCoord, to: GridCellCoord): number;
  hasLineOfSight(from: GridCellCoord, to: GridCellCoord): boolean;
}

function ensureSide(graph: NavalDetectionGraph, sideId: string): void {
  if (!graph.visibleTargetsBySide.has(sideId)) graph.visibleTargetsBySide.set(sideId, new Set());
  if (!graph.observersBySide.has(sideId)) graph.observersBySide.set(sideId, new Map());
}

function recordDetection(
  graph: NavalDetectionGraph,
  sideId: string,
  targetShipId: string,
  observerShipId: string
): void {
  ensureSide(graph, sideId);
  graph.visibleTargetsBySide.get(sideId)?.add(targetShipId);
  const targets = graph.observersBySide.get(sideId);
  let observers = targets?.get(targetShipId);
  if (!observers) {
    observers = new Set();
    targets?.set(targetShipId, observers);
  }
  observers.add(observerShipId);
}

export function effectiveShipDetectionRange(
  ship: Pick<ShipState, "detectionOverride">,
  baseDetectionRangeCells: number
): number {
  return Math.max(0, ship.detectionOverride ?? baseDetectionRangeCells);
}

export function buildNavalDetectionGraph(input: NavalDetectionInput): NavalDetectionGraph {
  const graph: NavalDetectionGraph = {
    visibleTargetsBySide: new Map(),
    observersBySide: new Map()
  };
  for (const ship of input.ships) ensureSide(graph, ship.sideId);

  for (const observer of input.ships) {
    const range = effectiveShipDetectionRange(observer.state, input.baseDetectionRangeCells);
    for (const target of input.ships) {
      if (observer.id === target.id || observer.sideId === target.sideId) continue;
      if (input.distanceCells(observer.cell, target.cell) > range) continue;
      if (!input.hasLineOfSight(observer.cell, target.cell)) continue;
      recordDetection(graph, observer.sideId, target.id, observer.id);
    }
  }

  return graph;
}
