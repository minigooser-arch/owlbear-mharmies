import type { DetectionGraph, DetectionGraphInput } from "./detectionGraph";
import { buildDetectionGraph } from "./detectionGraph";
import { measureOperation, recordPerformance } from "../performance/metrics";

/**
 * A single successful graph per background iframe. No authoritative scene
 * objects are cached: the caller must supply freshly resolved detection inputs.
 * Only confirmed square-grid geometry is eligible, and each role/player still
 * calculates its own visible set from the latest sides and army information.
 */
export class DetectionGraphCache {
  private entry: { signature: string; graph: DetectionGraph } | undefined;
  private generation = 0;

  invalidate(): void {
    this.entry = undefined;
    this.generation += 1;
  }

  private signature(input: DetectionGraphInput): string | undefined {
    // Unknown grid metrics can hide non-square measurement rules; always
    // recalculate those scenes rather than risking a stale visibility result.
    if (input.squareGridDpi === undefined ||
        !Number.isFinite(input.squareGridDpi) || input.squareGridDpi <= 0 ||
        input.units.length > 300 || input.visionBarriers.length > 2_000) return undefined;

    for (const unit of input.units) {
      if (!Number.isFinite(unit.position.x) || !Number.isFinite(unit.position.y) ||
          !Number.isFinite(unit.detectionRangeCells) ||
          (unit.concealmentCells !== undefined && !Number.isFinite(unit.concealmentCells))) {
        return undefined;
      }
    }
    for (const wall of input.visionBarriers) {
      if (!Number.isFinite(wall.from.x) || !Number.isFinite(wall.from.y) ||
          !Number.isFinite(wall.to.x) || !Number.isFinite(wall.to.y)) return undefined;
    }

    // No scene.revision dependency: unrelated HP and economics changes may
    // reuse detection, but positions, ranges, concealment, sides, walls,
    // measurement context and mode always participate in cache validation.
    const signature = JSON.stringify([
      input.mode,
      input.squareGridDpi,
      input.units.map(unit => [
        unit.id, unit.sideId, unit.position.x, unit.position.y,
        unit.detectionRangeCells, unit.concealmentCells ?? 0,
        unit.ignoresVisionBarriers
      ]),
      input.visionBarriers.map(wall => [
        wall.barrierId, wall.from.x, wall.from.y, wall.to.x, wall.to.y
      ])
    ]);
    return signature.length <= 1_000_000 ? signature : undefined;
  }

  async resolve(input: DetectionGraphInput): Promise<DetectionGraph> {
    const signature = this.signature(input);
    if (signature !== undefined && this.entry?.signature === signature) {
      recordPerformance("visibility.detectionGraphCacheHit", 0);
      // Prevent callers from modifying the retained Map/Set structure.
      return structuredClone(this.entry.graph);
    }

    const generation = this.generation;
    const graph = await measureOperation(
      "visibility.detectionGraphBuild",
      () => buildDetectionGraph(input)
    );
    // A scene/grid transition during an in-flight calculation must not
    // publish the stale result back into a newly invalidated cache.
    if (signature !== undefined && generation === this.generation &&
        signature === this.signature(input)) {
      this.entry = { signature, graph: structuredClone(graph) };
    }
    return graph;
  }
}
