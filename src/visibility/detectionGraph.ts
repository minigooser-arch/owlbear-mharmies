import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import type { GridDistancePort } from "../routes/routeMath";
import type { DetectionMode, Vector2 } from "../shared/types";

export interface DetectionUnit {
  id: string;
  sideId: string;
  position: Vector2;
  detectionRangeCells: number;
  ignoresVisionBarriers: boolean;
}

export interface DetectionGraph {
  visibleTargetsBySide: Map<string, Set<string>>;
  observersBySide: Map<string, Map<string, Set<string>>>;
}

export interface DetectionGraphInput {
  mode: DetectionMode;
  units: readonly DetectionUnit[];
  distancePort: GridDistancePort;
  visionBarriers: readonly BarrierSegment[];
}

function ensureSide(graph: DetectionGraph, sideId: string): void {
  if (!graph.visibleTargetsBySide.has(sideId)) graph.visibleTargetsBySide.set(sideId, new Set());
  if (!graph.observersBySide.has(sideId)) graph.observersBySide.set(sideId, new Map());
}

function recordDetection(
  graph: DetectionGraph,
  sideId: string,
  targetUnitId: string,
  observerUnitId: string
): void {
  ensureSide(graph, sideId);
  graph.visibleTargetsBySide.get(sideId)?.add(targetUnitId);
  const targets = graph.observersBySide.get(sideId);
  let observers = targets?.get(targetUnitId);
  if (!observers) {
    observers = new Set();
    targets?.set(targetUnitId, observers);
  }
  observers.add(observerUnitId);
}

export async function buildDetectionGraph(input: DetectionGraphInput): Promise<DetectionGraph> {
  const graph: DetectionGraph = {
    visibleTargetsBySide: new Map(),
    observersBySide: new Map()
  };
  for (const unit of input.units) ensureSide(graph, unit.sideId);

  for (const observer of input.units) {
    for (const target of input.units) {
      if (observer.id === target.id || observer.sideId === target.sideId) continue;
      const distance = await input.distancePort.distance(observer.position, target.position);
      if (distance > observer.detectionRangeCells) continue;
      if (
        !observer.ignoresVisionBarriers &&
        firstBarrierIntersection(
          { from: observer.position, to: target.position },
          input.visionBarriers
        )
      ) {
        continue;
      }
      recordDetection(graph, observer.sideId, target.id, observer.id);
      if (input.mode === "MUTUAL") {
        recordDetection(graph, target.sideId, observer.id, target.id);
      }
    }
  }
  return graph;
}
