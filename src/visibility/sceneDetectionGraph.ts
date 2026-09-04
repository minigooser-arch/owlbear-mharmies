import type { BarrierSegment } from "../barriers/barrierGeometry";
import type { GridDistancePort } from "../routes/routeMath";
import type { ArmyState, SceneItemRecord, SceneState, ShipState } from "../shared/types";
import { buildDetectionGraph, type DetectionGraph } from "./detectionGraph";

export interface SceneDetectionArmy {
  item: SceneItemRecord;
  state: ArmyState;
}

export async function buildSceneDetectionGraph(input: {
  scene: SceneState;
  armies: readonly SceneDetectionArmy[];
  sceneItems: readonly SceneItemRecord[];
  distancePort: GridDistancePort;
  visionBarriers: readonly BarrierSegment[];
}): Promise<DetectionGraph> {
  const sceneItemById = new Map(input.sceneItems.map((item) => [item.id, item]));
  const armyDetectionUnits = input.armies.map(({ item, state }) => ({
    id: item.id,
    sideId: state.sideId,
    position: item.position,
    detectionRangeCells:
      state.overrides.detectionRangeCells ?? input.scene.settings.defaultDetectionRangeCells,
    ignoresVisionBarriers: state.ignoresVisionBarriers
  }));
  const shipDetectionUnits = Object.entries(input.scene.ships ?? {}).flatMap(([shipId, state]) => {
    const item = sceneItemById.get(shipId);
    if (!item) return [];
    return [{
      id: shipId,
      sideId: state.sideId,
      position: item.position,
      detectionRangeCells: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,
      ignoresVisionBarriers: false
    }];
  });

  return buildDetectionGraph({
    mode: input.scene.settings.detectionMode,
    units: [...armyDetectionUnits, ...shipDetectionUnits],
    distancePort: input.distancePort,
    visionBarriers: input.visionBarriers
  });
}

export function detectedShipIdsForSide(
  graph: DetectionGraph,
  ships: Readonly<Record<string, ShipState>>,
  sideId: string
): Set<string> {
  return new Set(
    [...(graph.visibleTargetsBySide.get(sideId) ?? [])]
      .filter((unitId) => ships[unitId] !== undefined)
  );
}
