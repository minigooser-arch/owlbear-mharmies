import { describe, expect, it } from "vitest";
import type { GridDistancePort } from "../routes/routeMath";
import type { SideRelation, Vector2 } from "../shared/types";
import { findEarliestEnemyCollision } from "./collisionEngine";

const distancePort: GridDistancePort = {
  distance: async (from: Vector2, to: Vector2) => Math.hypot(to.x - from.x, to.y - from.y)
};

function crossing(relation: SideRelation) {
  return {
    armies: [
      {
        id: "a",
        sideId: "A",
        from: { x: 0, y: 0 },
        to: { x: 10, y: 0 },
        collisionRangeCells: 0.5
      },
      {
        id: "b",
        sideId: "B",
        from: { x: 10, y: 0 },
        to: { x: 0, y: 0 },
        collisionRangeCells: 0.5
      }
    ],
    relationForSides: () => relation,
    distancePort
  };
}

describe("swept collisions", () => {
  it.each(["ALLY", "NEUTRAL"] as const)("does not collide for %s", async (relation) => {
    expect(await findEarliestEnemyCollision(crossing(relation))).toBeUndefined();
  });

  it("stops enemy armies at their first contact between ticks", async () => {
    const hit = await findEarliestEnemyCollision(crossing("ENEMY"));
    expect(hit?.time).toBeGreaterThan(0);
    expect(hit?.time).toBeLessThan(0.5);
    expect(hit?.armyAId).toBe("a");
    expect(hit?.armyBId).toBe("b");
    if (hit) {
      expect(await distancePort.distance(hit.positionA, hit.positionB)).toBeCloseTo(0.5, 4);
    }
  });

  it("returns the earliest collision among multiple enemy pairs", async () => {
    const input = crossing("ENEMY");
    input.armies.push({
      id: "c",
      sideId: "B",
      from: { x: 4, y: 0 },
      to: { x: 4, y: 0 },
      collisionRangeCells: 0.5
    });
    const hit = await findEarliestEnemyCollision(input);
    expect(hit?.armyBId).toBe("c");
    expect(hit?.time).toBeCloseTo(0.35, 2);
  });
});
