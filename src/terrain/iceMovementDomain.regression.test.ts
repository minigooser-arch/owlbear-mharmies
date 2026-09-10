import { expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import { cellSupportsDomain } from "./movementDomains";

it("allows land movement on ice but blocks ships", () => {
  const scene = {
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1 as const,
      revision: 0,
      cells: {
        "0,0": {
          terrainId: "ice",
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: null,
          deFactoStateId: null
        }
      }
    }
  };

  expect(cellSupportsDomain(scene, { x: 0, y: 0 }, "LAND")).toBe(true);
  expect(cellSupportsDomain(scene, { x: 0, y: 0 }, "SEA")).toBe(false);
});
