import { describe, expect, it } from "vitest";
import { firstBarrierIntersection } from "../barriers/barrierGeometry";
import type { GridDistancePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";
import { buildDetectionGraph, type DetectionUnit } from "./detectionGraph";

function serializeGraph(graph: Awaited<ReturnType<typeof buildDetectionGraph>>) {
  return {
    visible: [...graph.visibleTargetsBySide].map(([side, targets]) => [side, [...targets]]),
    observers: [...graph.observersBySide].map(([side, targets]) => [
      side,
      [...targets].map(([target, observers]) => [target, [...observers]])
    ])
  };
}

async function sequentialReference(input: Parameters<typeof buildDetectionGraph>[0]) {
  const graph = { visibleTargetsBySide: new Map<string, Set<string>>(), observersBySide: new Map<string, Map<string, Set<string>>>() };
  const detect = (side: string, target: string, observer: string) => {
    const visible = graph.visibleTargetsBySide.get(side) ?? new Set<string>();
    visible.add(target);
    graph.visibleTargetsBySide.set(side, visible);
    const targets = graph.observersBySide.get(side) ?? new Map<string, Set<string>>();
    const observers = targets.get(target) ?? new Set<string>();
    observers.add(observer);
    targets.set(target, observers);
    graph.observersBySide.set(side, targets);
  };
  for (const unit of input.units) {
    graph.visibleTargetsBySide.set(unit.sideId, graph.visibleTargetsBySide.get(unit.sideId) ?? new Set());
    graph.observersBySide.set(unit.sideId, graph.observersBySide.get(unit.sideId) ?? new Map());
  }
  for (const observer of input.units) for (const target of input.units) {
    if (observer.id === target.id || observer.sideId === target.sideId) continue;
    const distance = await input.distancePort.distance(observer.position, target.position);
    if (distance > observer.detectionRangeCells) continue;
    if (!observer.ignoresVisionBarriers && firstBarrierIntersection(
      { from: observer.position, to: target.position }, input.visionBarriers
    )) continue;
    detect(observer.sideId, target.id, observer.id);
    if (input.mode === "MUTUAL") detect(target.sideId, observer.id, target.id);
  }
  return graph;
}

const distancePort: GridDistancePort = {
  distance: async (from: Vector2, to: Vector2) => Math.hypot(to.x - from.x, to.y - from.y)
};

function unit(
  id: string,
  sideId: string,
  x: number,
  y: number,
  detectionRangeCells: number,
  ignoresVisionBarriers = false
): DetectionUnit {
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
      units: [unit("a", "A", 0, 0, 10), unit("b", "B", 5, 0, 1), unit("c", "C", 100, 0, 10)],
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
      units: [unit("a", "A", 0, 0, 10), unit("b", "B", 5, 0, 1), unit("c", "C", 100, 0, 10)],
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
      units: [unit("a", "A", 0, 0, 10), unit("b", "B", 5, 0, 1)]
    });
    const ignored = await buildDetectionGraph({
      ...input,
      units: [unit("a", "A", 0, 0, 10, true), unit("b", "B", 5, 0, 1)]
    });
    expect(blocked.visibleTargetsBySide.get("A")).toEqual(new Set());
    expect(ignored.visibleTargetsBySide.get("A")).toEqual(new Set(["b"]));
  });

  it("preserves the sequential graph while limiting distance calls to eight workers", async () => {
    const units = [
      ...Array.from({ length: 6 }, (_, index) => unit(`a${index}`, "A", index * 4, 0, 15, index === 0)),
      ...Array.from({ length: 6 }, (_, index) => unit(`b${index}`, "B", index * 4, 12, 11))
    ];
    const visionBarriers = [{ barrierId: "wall", from: { x: 8, y: -1 }, to: { x: 8, y: 13 } }];
    const expected = await sequentialReference({ mode: "MUTUAL", units, distancePort, visionBarriers });
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const delayed: GridDistancePort = {
      distance: async (from, to) => {
        calls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return Math.hypot(to.x - from.x, to.y - from.y);
      }
    };
    const actual = await buildDetectionGraph({ mode: "MUTUAL", units, distancePort: delayed, visionBarriers });
    expect(serializeGraph(actual)).toEqual(serializeGraph(expected));
    expect(calls).toBe(72);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });
});
