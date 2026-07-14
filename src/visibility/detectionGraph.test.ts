import { describe, expect, it } from "vitest";
import type { GridDistancePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";
import { buildDetectionGraph, type DetectionArmy } from "./detectionGraph";

const distancePort: GridDistancePort = {
  distance: async (from: Vector2, to: Vector2) => Math.hypot(to.x - from.x, to.y - from.y)
};

function army(
  id: string,
  sideId: string,
  x: number,
  y: number,
  detectionRangeCells: number,
  ignoresVisionBarriers = false
): DetectionArmy {
  return {
    id,
    sideId,
    position: { x, y },
    detectionRangeCells,
    ignoresVisionBarriers
  };
}

describe("detection graph", () => {
  it("keeps independent detection one-way and does not reveal to side C", async () => {
    const graph = await buildDetectionGraph({
      mode: "INDEPENDENT",
      armies: [army("a", "A", 0, 0, 10), army("b", "B", 5, 0, 1), army("c", "C", 100, 0, 10)],
      distancePort,
      visionBarriers: []
    });
    expect(graph.visibleTargetsBySide.get("A")).toEqual(new Set(["b"]));
    expect(graph.visibleTargetsBySide.get("B")).toEqual(new Set());
    expect(graph.visibleTargetsBySide.get("C")).toEqual(new Set());
    expect(graph.observersBySide.get("A")?.get("b")).toEqual(new Set(["a"]));
  });

  it("adds mutual visibility only to the target side", async () => {
    const graph = await buildDetectionGraph({
      mode: "MUTUAL",
      armies: [army("a", "A", 0, 0, 10), army("b", "B", 5, 0, 1), army("c", "C", 100, 0, 10)],
      distancePort,
      visionBarriers: []
    });
    expect(graph.visibleTargetsBySide.get("A")).toEqual(new Set(["b"]));
    expect(graph.visibleTargetsBySide.get("B")).toEqual(new Set(["a"]));
    expect(graph.visibleTargetsBySide.get("C")).toEqual(new Set());
  });

  it("blocks detection behind a wall unless the observer ignores vision barriers", async () => {
    const input = {
      mode: "INDEPENDENT" as const,
      distancePort,
      visionBarriers: [{ barrierId: "wall", from: { x: 2, y: -2 }, to: { x: 2, y: 2 } }]
    };
    const blocked = await buildDetectionGraph({
      ...input,
      armies: [army("a", "A", 0, 0, 10), army("b", "B", 5, 0, 1)]
    });
    const ignored = await buildDetectionGraph({
      ...input,
      armies: [army("a", "A", 0, 0, 10, true), army("b", "B", 5, 0, 1)]
    });
    expect(blocked.visibleTargetsBySide.get("A")).toEqual(new Set());
    expect(ignored.visibleTargetsBySide.get("A")).toEqual(new Set(["b"]));
  });
});
