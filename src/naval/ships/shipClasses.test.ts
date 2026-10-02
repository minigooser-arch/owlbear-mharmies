import { describe, expect, it } from "vitest";
import { SHIP_CLASSES } from "./shipClasses";

describe("canonical ship classes", () => {
  it("matches the Letopis naval class table", () => {
    expect(SHIP_CLASSES.BATTLESHIP).toMatchObject({ maxHp: 30, armor: 3, movement: 2, normalDice: 3, normalRangeMin: 2, normalRangeMax: 3 });
    expect(SHIP_CLASSES.CRUISER).toMatchObject({ maxHp: 25, armor: 1, movement: 3, normalDice: 2, normalRangeMin: 1, normalRangeMax: 2 });
    expect(SHIP_CLASSES.IRONCLAD).toMatchObject({ maxHp: 25, armor: 2, movement: 4, normalDice: 2, normalRangeMin: 1, normalRangeMax: 1 });
    expect(SHIP_CLASSES.HOSPITAL).toMatchObject({ maxHp: 20, armor: 0, movement: 4, normalDice: 0 });
    expect(SHIP_CLASSES.TRANSPORT).toMatchObject({ name: "Грузовой корабль", maxHp: 20, armor: 0, movement: 4, normalDice: 0 });
  });

  it("stores physical construction requirements for registration", () => {
    expect(SHIP_CLASSES.BATTLESHIP).toMatchObject({ minLengthChunks: 7, minWidthChunks: 2 });
    expect(SHIP_CLASSES.IRONCLAD).toMatchObject({ minLengthChunks: 6, minWidthChunks: 2 });
    expect(SHIP_CLASSES.CRUISER).toMatchObject({ minLengthChunks: 5, minWidthChunks: 2 });
    expect(SHIP_CLASSES.HOSPITAL).toMatchObject({ minLengthChunks: 5, minWidthChunks: 2 });
    expect(SHIP_CLASSES.TRANSPORT).toMatchObject({ minLengthChunks: 5, minWidthChunks: 2 });
    for (const shipClass of Object.values(SHIP_CLASSES)) {
      expect(shipClass.constructionRequirements.length).toBeGreaterThan(0);
    }
  });
});
