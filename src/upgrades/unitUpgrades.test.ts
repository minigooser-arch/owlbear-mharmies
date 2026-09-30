import { describe, expect, it } from "vitest";
import type { ArmyState, ShipState } from "../shared/types";
import {
  armyEffectiveDetectionRange,
  armyEffectiveMovementUnits,
  armyRecoveryHpCap,
  armyTerrainMovementCostUnits,
  hospitalSupportDice,
  hospitalSupportRange,
  purchaseArmyUpgrade,
  purchaseShipUpgrade,
  shipEffectiveArmor,
  shipEffectiveAttackDice,
  shipEffectiveMaxHp,
  shipEffectiveMovement,
  shipEffectiveRangeMax,
  transportCapacity,
  transportLoadingIsFree
} from "./unitUpgrades";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";

function army(experience = 20): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 0,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 40, maxHp: 40 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1,
    experience,
    upgrades: { recovery: {}, motorization: {}, reconnaissance: {} }
  };
}

function buyArmy(
  current: ArmyState,
  branch: "recovery" | "motorization" | "reconnaissance",
  level: 1 | 2 | 3,
  variant: "A" | "B"
): ArmyState {
  const result = purchaseArmyUpgrade(current, branch, level, variant);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.army;
}

function buyShip(current: ShipState, level: 1 | 2 | 3, variant: "A" | "B"): ShipState {
  const result = purchaseShipUpgrade(current, level, variant);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.ship;
}

describe("unit upgrades", () => {
  it("charges level I/II/III upgrades as 1/2/3 XP and permits mixed variants", () => {
    let value = army(10);
    value = buyArmy(value, "motorization", 1, "A");
    expect(value.experience).toBe(9);
    value = buyArmy(value, "motorization", 2, "B");
    expect(value.experience).toBe(7);
    value = buyArmy(value, "motorization", 3, "A");
    expect(value.experience).toBe(4);
    expect(value.upgrades?.motorization).toEqual({ level1: "A", level2: "B", level3: "A" });
  });

  it("allows I/II in every land branch but only one level III overall", () => {
    let value = army();
    value = buyArmy(value, "recovery", 1, "A");
    value = buyArmy(value, "recovery", 2, "B");
    value = buyArmy(value, "recovery", 3, "A");
    value = buyArmy(value, "reconnaissance", 1, "A");
    value = buyArmy(value, "reconnaissance", 2, "A");
    const blocked = purchaseArmyUpgrade(value, "reconnaissance", 3, "B");
    expect(blocked).toEqual({ ok: false, reason: "ARMY_THIRD_LEVEL_ALREADY_SELECTED" });
  });

  it("stacks land movement bonuses and terrain discounts in internal half-OP units", () => {
    let value = army();
    value = buyArmy(value, "motorization", 1, "B");
    value = buyArmy(value, "motorization", 2, "B");
    value = buyArmy(value, "motorization", 3, "B");
    expect(armyEffectiveMovementUnits(value)).toBe(10);
    expect(armyTerrainMovementCostUnits(value, "forest_hills", 6)).toBe(2);
    expect(armyTerrainMovementCostUnits(value, "road", 1)).toBe(1);
  });

  it("applies recovery bonuses in order and floors military medicine", () => {
    let value = army();
    value = buyArmy(value, "recovery", 1, "B");
    value = buyArmy(value, "recovery", 2, "A");
    value = buyArmy(value, "recovery", 3, "B");
    expect(armyRecoveryHpCap(value, "FIELD")).toBe(18); // floor((5+2+5)*1.5)
    expect(armyRecoveryHpCap(value, "CITY_OR_ROAD")).toBe(18); // floor((10+2)*1.5)
    expect(armyRecoveryHpCap(value, "HOSPITAL")).toBe(25); // floor((15+2)*1.5)
  });

  it("stacks reconnaissance range independently from concealment", () => {
    let value = army();
    value = buyArmy(value, "reconnaissance", 1, "A");
    value = buyArmy(value, "reconnaissance", 2, "A");
    value = buyArmy(value, "reconnaissance", 3, "A");
    expect(armyEffectiveDetectionRange(value, 6)).toBe(10);
  });

  it("applies battleship upgrades to hp, armor, movement, dice and range", () => {
    let ship = createRegisteredShip("red", "BATTLESHIP", "NORTH");
    ship.experience = 10;
    ship = buyShip(ship, 1, "A");
    ship = buyShip(ship, 2, "A");
    ship = buyShip(ship, 3, "A");
    expect(shipEffectiveMaxHp(ship)).toBe(35);
    expect(shipEffectiveArmor(ship)).toBe(4);
    expect(shipEffectiveAttackDice(ship)).toBe(4);
    expect(shipEffectiveMovement(ship)).toBe(2);

    let rangeShip = createRegisteredShip("red", "BATTLESHIP", "NORTH");
    rangeShip.experience = 10;
    rangeShip = buyShip(rangeShip, 1, "B");
    rangeShip = buyShip(rangeShip, 2, "B");
    rangeShip = buyShip(rangeShip, 3, "B");
    expect(shipEffectiveMovement(rangeShip)).toBe(3);
    expect(shipEffectiveRangeMax(rangeShip)).toBe(4);
  });

  it("adds ironclad gun upgrades to the special 3d6 close attack", () => {
    let ship = createRegisteredShip("red", "IRONCLAD", "NORTH");
    ship.experience = 10;
    ship = buyShip(ship, 1, "A");
    ship = buyShip(ship, 2, "B");
    ship = buyShip(ship, 3, "B");
    expect(shipEffectiveAttackDice(ship, true)).toBe(5);
  });

  it("upgrades hospital support from 2d6 range 1 to 4d6 range 1 or 3d6 range 2 by choices", () => {
    let diceShip = createRegisteredShip("red", "HOSPITAL", "NORTH");
    diceShip.experience = 10;
    diceShip = buyShip(diceShip, 1, "A");
    diceShip = buyShip(diceShip, 2, "B");
    diceShip = buyShip(diceShip, 3, "A");
    expect(hospitalSupportDice(diceShip)).toBe(4);
    expect(hospitalSupportRange(diceShip)).toBe(1);

    let rangeShip = createRegisteredShip("red", "HOSPITAL", "NORTH");
    rangeShip.experience = 10;
    rangeShip = buyShip(rangeShip, 1, "A");
    rangeShip = buyShip(rangeShip, 2, "B");
    rangeShip = buyShip(rangeShip, 3, "B");
    expect(hospitalSupportDice(rangeShip)).toBe(3);
    expect(hospitalSupportRange(rangeShip)).toBe(2);
  });

  it("supports both mutually exclusive transport level III effects", () => {
    let capacityShip = createRegisteredShip("red", "TRANSPORT", "NORTH");
    capacityShip.experience = 10;
    capacityShip = buyShip(capacityShip, 1, "A");
    capacityShip = buyShip(capacityShip, 2, "A");
    capacityShip = buyShip(capacityShip, 3, "A");
    expect(transportCapacity(capacityShip)).toBe(2);
    expect(transportLoadingIsFree(capacityShip)).toBe(false);

    let freeShip = createRegisteredShip("red", "TRANSPORT", "NORTH");
    freeShip.experience = 10;
    freeShip = buyShip(freeShip, 1, "A");
    freeShip = buyShip(freeShip, 2, "A");
    freeShip = buyShip(freeShip, 3, "B");
    expect(transportCapacity(freeShip)).toBe(1);
    expect(transportLoadingIsFree(freeShip)).toBe(true);
  });
});
