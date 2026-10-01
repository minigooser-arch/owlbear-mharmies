import { describe, expect, it } from "vitest";
import { createFormationArmy } from "../armies/armyFormation";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { applyAutomaticArmyFormation } from "./formationCheckpoint";

function scene(humanResource = 584, withTrainingGround = false): SceneState {
  return {
    version: 9,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Red", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "red-state" }],
    states: [{ id: "red-state", name: "Red State", rulingFactionId: "red", active: true }],
    relations: {},
    stateRelations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 1,
      cells: {
        "0,0": {
          terrainId: "plain",
          impassable: false,
          factionTerritoryIds: ["red"],
          recognizedStateId: "red-state",
          deFactoStateId: "red-state"
        }
      }
    },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE) },
    strategicCities: withTrainingGround ? [{
      id: "city-red",
      name: "Red City",
      cells: [{ x: 0, y: 0 }],
      recognizedStateId: "red-state",
      deFactoStateId: "red-state",
      factionInfluenceId: "red",
      mayorId: null,
      isCapital: false,
      historicalBuildTypeCount: 0,
      buildings: [{ id: "training", type: "TRAINING_GROUND", cell: { x: 0, y: 0 } }]
    }] : [],
    demographics: [{
      stateId: "red-state",
      population: 46_084,
      populationGrowthFactor: 1.003,
      humanResource,
      conscriptionLawId: "URGENT_CONSCRIPTION",
      conscriptionRate: 0.04,
      humanResourceCapacity: 1_843.36,
      lastPopulationCalculationDate: "2026-09-29"
    }],
    lrTransactions: []
  };
}

function forming(cityId: string | null = null): ArmyState {
  const army = createFormationArmy({
    armyId: "army",
    sideId: "red",
    status: "READY",
    maxUnits: 10,
    turnNumber: 2,
    experience: 0
  });
  army.formation = { active: true, cityId, hpAddedThisTurn: 0, checkedOnTurn: 2 };
  return army;
}

describe("automatic army formation", () => {
  it("adds 10 HP per turn at 10k human resource per HP", () => {
    const current = scene();
    const armies = applyAutomaticArmyFormation(current, { army: forming() }, 2, "2026-10-01T00:00:00.000Z");

    expect(armies.army?.health.hp).toBe(10);
    expect(armies.army?.formation).toMatchObject({ active: true, hpAddedThisTurn: 10, checkedOnTurn: 2 });
    expect(current.demographics?.[0]?.humanResource).toBe(484);
    expect(current.lrTransactions?.[0]).toMatchObject({
      kind: "FORMATION",
      hp: 10,
      ratePerHp: 10,
      amount: 100
    });
  });

  it("adds 15 HP when the formation city has an active training ground", () => {
    const current = scene(584, true);
    const armies = applyAutomaticArmyFormation(current, { army: forming("city-red") }, 2, "2026-10-01T00:00:00.000Z");

    expect(armies.army?.health.hp).toBe(15);
    expect(armies.army?.formation).toMatchObject({ active: true, hpAddedThisTurn: 15, checkedOnTurn: 2 });
    expect(current.demographics?.[0]?.humanResource).toBe(434);
    expect(current.lrTransactions?.[0]).toMatchObject({ hp: 15, ratePerHp: 10, amount: 150 });
  });

  it("forms only as many HP as the available human resource can pay for", () => {
    const current = scene(27);
    const armies = applyAutomaticArmyFormation(current, { army: forming() }, 2, "2026-10-01T00:00:00.000Z");

    expect(armies.army?.health.hp).toBe(2);
    expect(armies.army?.formation?.hpAddedThisTurn).toBe(2);
    expect(current.demographics?.[0]?.humanResource).toBe(7);
    expect(current.lrTransactions?.[0]).toMatchObject({ hp: 2, amount: 20 });
  });

  it("stops formation and restores movement when max HP is reached", () => {
    const current = scene();
    const almostReady = forming();
    almostReady.health = { hp: 35, maxHp: 40 };

    const armies = applyAutomaticArmyFormation(current, { army: almostReady }, 2, "2026-10-01T00:00:00.000Z");

    expect(armies.army?.health.hp).toBe(40);
    expect(armies.army?.formation?.active).toBe(false);
    expect(armies.army?.movement.remainingUnits).toBe(10);
    expect(current.demographics?.[0]?.humanResource).toBe(534);
    expect(current.lrTransactions?.[0]).toMatchObject({ kind: "COMPLETION", hp: 5, amount: 50 });
  });
});
