import type { ShipClassId } from "../../shared/types";

export interface ShipClassDefinition {
  id: ShipClassId;
  name: string;
  maxHp: number;
  armor: number;
  movement: number;
  normalDice: number;
  normalRangeMin: number;
  normalRangeMax: number;
}

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClassDefinition>> = Object.freeze({
  BATTLESHIP: Object.freeze({ id: "BATTLESHIP", name: "Линкор", maxHp: 30, armor: 3, movement: 2, normalDice: 3, normalRangeMin: 2, normalRangeMax: 3 }),
  CRUISER: Object.freeze({ id: "CRUISER", name: "Крейсер", maxHp: 25, armor: 1, movement: 3, normalDice: 2, normalRangeMin: 1, normalRangeMax: 2 }),
  IRONCLAD: Object.freeze({ id: "IRONCLAD", name: "Броненосец", maxHp: 25, armor: 2, movement: 4, normalDice: 2, normalRangeMin: 1, normalRangeMax: 2 }),
  HOSPITAL: Object.freeze({ id: "HOSPITAL", name: "Госпитальное судно", maxHp: 20, armor: 0, movement: 4, normalDice: 0, normalRangeMin: 0, normalRangeMax: 0 }),
  TRANSPORT: Object.freeze({ id: "TRANSPORT", name: "Транспорт", maxHp: 20, armor: 0, movement: 4, normalDice: 0, normalRangeMin: 0, normalRangeMax: 0 })
});
