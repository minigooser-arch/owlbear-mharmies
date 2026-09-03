import { describe, expect, it } from "vitest";
import { SHIP_CLASSES } from "./shipClasses";

describe("canonical ship classes", () => {
  it("matches the Letopis naval class table", () => {
    expect(SHIP_CLASSES.BATTLESHIP).toMatchObject({ maxHp: 30, armor: 3, movement: 2, normalDice: 3, normalRangeMin: 2, normalRangeMax: 3 });
    expect(SHIP_CLASSES.CRUISER).toMatchObject({ maxHp: 25, armor: 1, movement: 3, normalDice: 2, normalRangeMin: 1, normalRangeMax: 2 });
    expect(SHIP_CLASSES.IRONCLAD).toMatchObject({ maxHp: 25, armor: 2, movement: 4, normalDice: 2, normalRangeMin: 1, normalRangeMax: 2 });
    expect(SHIP_CLASSES.HOSPITAL).toMatchObject({ maxHp: 20, armor: 0, movement: 4, normalDice: 0 });
    expect(SHIP_CLASSES.TRANSPORT).toMatchObject({ maxHp: 20, armor: 0, movement: 4, normalDice: 0 });
  });
});
