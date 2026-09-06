import { describe, expect, it } from "vitest";
import type { GridCellCoord, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { buildNavalDetectionGraph, effectiveShipDetectionRange } from "./navalDetection";

function ship(sideId: string, detectionOverride: number | null = null): ShipState {
  return { ...createRegisteredShip(sideId, "CRUISER", "NORTH"), detectionOverride };
}

function maxAxisDistance(left: GridCellCoord, right: GridCellCoord): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

describe("naval detection", () => {
  it("uses the common base range when a ship has no override", () => {
    expect(effectiveShipDetectionRange(ship("red"), 3)).toBe(3);
  });

  it("uses the GM per-ship override instead of the common base range", () => {
    expect(effectiveShipDetectionRange(ship("red", 5), 3)).toBe(5);
  });

  it("allows one side to detect independently when only its observer is in range", () => {
    const graph = buildNavalDetectionGraph({
      baseDetectionRangeCells: 1,
      ships: [
        { id: "red-scout", sideId: "red", cell: { x: 0, y: 0 }, state: ship("red", 3) },
        { id: "blue-ship", sideId: "blue", cell: { x: 2, y: 0 }, state: ship("blue") }
      ],
      distanceCells: maxAxisDistance,
      hasLineOfSight: () => true
    });
    expect(graph.visibleTargetsBySide.get("red")).toEqual(new Set(["blue-ship"]));
    expect(graph.visibleTargetsBySide.get("blue")).toEqual(new Set());
  });

  it("does not detect an enemy outside the effective range", () => {
    const graph = buildNavalDetectionGraph({
      baseDetectionRangeCells: 1,
      ships: [
        { id: "red-ship", sideId: "red", cell: { x: 0, y: 0 }, state: ship("red") },
        { id: "blue-ship", sideId: "blue", cell: { x: 2, y: 0 }, state: ship("blue") }
      ],
      distanceCells: maxAxisDistance,
      hasLineOfSight: () => true
    });
    expect(graph.visibleTargetsBySide.get("red")).toEqual(new Set());
  });

  it("does not detect an in-range enemy when naval LOS is blocked", () => {
    const graph = buildNavalDetectionGraph({
      baseDetectionRangeCells: 3,
      ships: [
        { id: "red-ship", sideId: "red", cell: { x: 0, y: 0 }, state: ship("red") },
        { id: "blue-ship", sideId: "blue", cell: { x: 2, y: 0 }, state: ship("blue") }
      ],
      distanceCells: maxAxisDistance,
      hasLineOfSight: () => false
    });
    expect(graph.visibleTargetsBySide.get("red")).toEqual(new Set());
  });

  it("never records same-side ships as detection targets", () => {
    const graph = buildNavalDetectionGraph({
      baseDetectionRangeCells: 10,
      ships: [
        { id: "red-a", sideId: "red", cell: { x: 0, y: 0 }, state: ship("red") },
        { id: "red-b", sideId: "red", cell: { x: 1, y: 0 }, state: ship("red") }
      ],
      distanceCells: maxAxisDistance,
      hasLineOfSight: () => true
    });
    expect(graph.visibleTargetsBySide.get("red")).toEqual(new Set());
  });
});
