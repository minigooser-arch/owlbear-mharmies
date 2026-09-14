import { describe, expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import type { Side, StateEntity } from "../shared/types";
import { RouteToolController } from "./routeTool";

const sides: Side[] = [
  { id: "red", name: "Правящие России", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "pink", name: "Оппозиция России", color: "#f8b", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "blue", name: "Правящие Германии", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "germany" }
];
const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#222222", rulingFactionId: "blue", active: true }
];

function activation(sideId: string) {
  return {
    armyId: `army-${sideId}`,
    start: { x: 50, y: 50 },
    startCell: { x: 0, y: 0 },
    gridDpi: 100,
    sideId,
    movementUnits: 10,
    maxUnits: 10,
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1 as const,
      revision: 0,
      cells: {
        "0,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "russia", deFactoStateId: "russia" },
        "1,0": { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "germany", deFactoStateId: "germany" }
      }
    },
    wars: [],
    sides,
    states,
    stateRelations: {},
    barriers: []
  };
}

const gridPort = {
  snapGridCenter: async (point: { x: number; y: number }) => ({
    x: Math.floor(point.x / 100) * 100 + 50,
    y: Math.floor(point.y / 100) * 100 + 50
  })
};

describe("political border route preview", () => {
  it("blocks a non-ruling faction at a closed foreign border", async () => {
    const controller = new RouteToolController(gridPort);
    controller.activate(activation("pink"));

    await controller.move({ x: 150, y: 50 });

    expect(controller.preview()).toMatchObject({
      valid: false,
      reason: "FOREIGN_STATE_CLOSED",
      label: "Закрытая граница: Германия"
    });
  });

  it("warns but permits a ruling faction route without mutating diplomacy", async () => {
    const stateRelations = {};
    const input = { ...activation("red"), stateRelations };
    const controller = new RouteToolController(gridPort);
    controller.activate(input);

    await controller.move({ x: 150, y: 50 });

    expect(controller.preview()).toMatchObject({
      valid: true,
      color: "#f9a825",
      label: expect.stringContaining("⚠ Вход в Германия объявит войну")
    });
    expect(stateRelations).toEqual({});
  });
});
