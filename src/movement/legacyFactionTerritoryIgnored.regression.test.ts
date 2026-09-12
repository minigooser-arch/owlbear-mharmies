import { expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import { validateMovementStep } from "./movementRules";

it("ignores legacy factionTerritoryIds when validating geometric movement", () => {
  const result = validateMovementStep({
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    sideId: "red",
    cell: {
      terrainId: "road",
      impassable: false,
      factionTerritoryIds: ["blue"],
      recognizedStateId: "foreign-state",
      deFactoStateId: "foreign-state"
    },
    terrain: structuredClone(DEFAULT_TERRAIN),
    wars: [],
    remainingUnits: 10,
    withinBounds: true,
    armyStateAllowsMovement: true
  });

  expect(result).toMatchObject({ allowed: true });
});
