import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "./shipLifecycle";
import { applyShipDamage } from "./shipDamage";

describe("ship damage with temporary hp", () => {
  it("absorbs damage with temporary hp before touching real hp", () => {
    const ship = { ...createRegisteredShip("red", "CRUISER", "NORTH"), hp: 20, temporaryHp: 7 };
    const result = applyShipDamage(ship, 5);

    expect(result).toMatchObject({ hp: 20, temporaryHp: 2, revision: ship.revision + 1 });
  });

  it("spends all temporary hp and applies only overflow to real hp", () => {
    const ship = { ...createRegisteredShip("red", "CRUISER", "NORTH"), hp: 20, temporaryHp: 4 };
    const result = applyShipDamage(ship, 9);

    expect(result).toMatchObject({ hp: 15, temporaryHp: 0, revision: ship.revision + 1 });
  });

  it("clamps real hp at zero after temporary hp is exhausted", () => {
    const ship = { ...createRegisteredShip("red", "HOSPITAL", "NORTH"), hp: 6, temporaryHp: 2 };
    const result = applyShipDamage(ship, 20);

    expect(result).toMatchObject({ hp: 0, temporaryHp: 0, revision: ship.revision + 1 });
  });

  it("does not mutate the input ship", () => {
    const ship = { ...createRegisteredShip("red", "BATTLESHIP", "NORTH"), hp: 20, temporaryHp: 5 };
    const before = structuredClone(ship);
    applyShipDamage(ship, 3);
    expect(ship).toEqual(before);
  });
});
