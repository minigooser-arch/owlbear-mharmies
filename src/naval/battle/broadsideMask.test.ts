import { describe, expect, it } from "vitest";
import type { GridCellCoord, ShipClassId, ShipFacing } from "../../shared/types";
import {
  isInNormalBroadsideMask,
  isInIroncladAdjacentSpecialMask
} from "./broadsideMask";

const origin: GridCellCoord = { x: 10, y: 10 };

function target(dx: number, dy: number): GridCellCoord {
  return { x: origin.x + dx, y: origin.y + dy };
}

function allowedOffsets(classId: ShipClassId, facing: ShipFacing, radius: number): string[] {
  const result: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (isInNormalBroadsideMask(classId, facing, origin, target(dx, dy))) {
        result.push(`${dx},${dy}`);
      }
    }
  }
  return result.sort();
}

const battleshipNorth = [
  "-3,-3", "-2,-3", "2,-3", "3,-3",
  "-3,-2", "-2,-2", "2,-2", "3,-2",
  "-2,-1", "2,-1",
  "-2,1", "2,1",
  "-3,2", "-2,2", "2,2", "3,2",
  "-3,3", "-2,3", "2,3", "3,3"
].sort();

const cruiserNorth = [
  "-2,-2", "2,-2",
  "-2,-1", "-1,-1", "1,-1", "2,-1",
  "-2,0", "-1,0", "1,0", "2,0",
  "-2,1", "-1,1", "1,1", "2,1",
  "-2,2", "2,2"
].sort();

describe("exact naval broadside masks", () => {
  it("matches the canonical north-facing battleship diagram exactly", () => {
    expect(allowedOffsets("BATTLESHIP", "NORTH", 3)).toEqual(battleshipNorth);
  });

  it("matches the canonical north-facing cruiser diagram exactly", () => {
    expect(allowedOffsets("CRUISER", "NORTH", 2)).toEqual(cruiserNorth);
  });

  it("uses the cruiser normal mask for ironclads", () => {
    expect(allowedOffsets("IRONCLAD", "NORTH", 2)).toEqual(cruiserNorth);
  });

  it("does not give hospital ships or transports a normal firing mask", () => {
    expect(allowedOffsets("HOSPITAL", "NORTH", 3)).toEqual([]);
    expect(allowedOffsets("TRANSPORT", "NORTH", 3)).toEqual([]);
  });

  it("rotates the canonical mask with ship facing", () => {
    // A north-facing cruiser can fire two cells to starboard/east.
    expect(isInNormalBroadsideMask("CRUISER", "NORTH", origin, target(2, 0))).toBe(true);
    // After turning east, that same relative starboard sector rotates south.
    expect(isInNormalBroadsideMask("CRUISER", "EAST", origin, target(0, 2))).toBe(true);
    expect(isInNormalBroadsideMask("CRUISER", "EAST", origin, target(2, 0))).toBe(false);
    expect(isInNormalBroadsideMask("CRUISER", "SOUTH", origin, target(-2, 0))).toBe(true);
    expect(isInNormalBroadsideMask("CRUISER", "WEST", origin, target(0, -2))).toBe(true);
  });

  it("keeps bow and stern out of every normal broadside mask", () => {
    expect(isInNormalBroadsideMask("BATTLESHIP", "NORTH", origin, target(0, -3))).toBe(false);
    expect(isInNormalBroadsideMask("BATTLESHIP", "NORTH", origin, target(0, 3))).toBe(false);
    expect(isInNormalBroadsideMask("CRUISER", "EAST", origin, target(2, 0))).toBe(false);
    expect(isInNormalBroadsideMask("CRUISER", "EAST", origin, target(-2, 0))).toBe(false);
  });

  it("defines the ironclad adjacent special only on its port/starboard cells", () => {
    expect(isInIroncladAdjacentSpecialMask("NORTH", origin, target(-1, 0))).toBe(true);
    expect(isInIroncladAdjacentSpecialMask("NORTH", origin, target(1, 0))).toBe(true);
    expect(isInIroncladAdjacentSpecialMask("NORTH", origin, target(0, -1))).toBe(false);
    expect(isInIroncladAdjacentSpecialMask("NORTH", origin, target(0, 1))).toBe(false);
    expect(isInIroncladAdjacentSpecialMask("EAST", origin, target(0, -1))).toBe(true);
    expect(isInIroncladAdjacentSpecialMask("EAST", origin, target(0, 1))).toBe(true);
    expect(isInIroncladAdjacentSpecialMask("EAST", origin, target(1, 0))).toBe(false);
  });
});
