import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import type { ShipFacing } from "../shared/types";
import { ShipRouteToolController } from "./shipRouteTool";

function controller() {
  const route = new ShipRouteToolController({ snapGridCenter: async (point) => ({ ...point }) });
  route.activate({
    shipId: "ship",
    start: { x: 50, y: 50 },
    startCell: { x: 0, y: 0 },
    gridDpi: 100,
    movementPoints: 4,
    maxMovementPoints: 4,
    facing: "EAST",
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: {
        ...structuredClone(DEFAULT_TERRAIN.types),
        sea: { id: "sea", name: "Море", movementCostUnits: 2, enabled: true, movementDomains: ["SEA"], blocksNavalLos: false }
      }
    },
    gridMap: {
      version: 1,
      revision: 0,
      cells: {
        "1,0": { terrainId: "sea", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
      }
    }
  });
  return route;
}

type TurnChoice = {
  facing: ShipFacing;
  cost: number;
  affordable: boolean;
  position: { x: number; y: number };
};

type TurnSnapshot = {
  finishButton?: { position: { x: number; y: number } };
  turnButton?: { position: { x: number; y: number }; label: string };
  turnChoices?: TurnChoice[];
  plannedFacing?: ShipFacing;
  spentMovementPoints: number;
  remainingMovementPoints: number;
  finalFacing: ShipFacing;
};

type TurnController = {
  toggleTurnMenu(): void;
  selectFinalFacing(facing: ShipFacing): { accepted: boolean; reason?: string };
};

describe("ship strategic final-turn controls", () => {
  it("shows Turn below Finish over the current cell even before movement", () => {
    const route = controller();
    const snapshot = route.snapshot() as unknown as TurnSnapshot;

    expect(snapshot.finishButton).toBeDefined();
    expect(snapshot.turnButton?.label).toBe("Поворот");
    expect(snapshot.turnButton?.position.y).toBeGreaterThan(snapshot.finishButton?.position.y ?? Infinity);
  });

  it("opens only the three alternative direction choices with the correct OP cost", () => {
    const route = controller();
    (route as unknown as TurnController).toggleTurnMenu();
    const snapshot = route.snapshot() as unknown as TurnSnapshot;

    expect(snapshot.turnChoices?.map(({ facing, cost, affordable }) => ({ facing, cost, affordable }))).toEqual([
      { facing: "NORTH", cost: 1, affordable: true },
      { facing: "SOUTH", cost: 1, affordable: true },
      { facing: "WEST", cost: 2, affordable: true }
    ]);
  });

  it("rejects selecting the direction the ship already faces", () => {
    const route = controller();
    const turn = route as unknown as TurnController;
    expect(turn.selectFinalFacing("EAST")).toEqual({ accepted: false, reason: "SAME_FACING" });
  });

  it("selects a terminal turn, charges it, and clears it if movement is extended", async () => {
    const route = controller();
    const turn = route as unknown as TurnController;
    expect(turn.selectFinalFacing("WEST")).toEqual({ accepted: true });

    let snapshot = route.snapshot() as unknown as TurnSnapshot;
    expect(snapshot).toMatchObject({
      plannedFacing: "WEST",
      spentMovementPoints: 2,
      remainingMovementPoints: 2,
      finalFacing: "WEST"
    });

    expect(await route.click({ x: 150, y: 50 })).toEqual({ accepted: true });
    snapshot = route.snapshot() as unknown as TurnSnapshot;
    expect(snapshot.plannedFacing).toBeUndefined();
    expect(snapshot.finalFacing).toBe("EAST");
    expect(snapshot.spentMovementPoints).toBe(1);
  });
});
