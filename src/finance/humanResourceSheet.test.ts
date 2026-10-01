import { describe, expect, it, vi } from "vitest";
import type { SceneState } from "../shared/types";
import {
  HumanResourceSheetError,
  HumanResourceSheetGateway,
  applyHumanResourceSheetSnapshot,
  humanResourceSpendsBetween
} from "./humanResourceSheet";

function scene(): SceneState {
  return {
    version: 9,
    revision: 7,
    settings: {
      defaultDetectionRangeCells: 3,
      defaultSpeedCellsPerSecond: 1,
      defaultCollisionRangeCells: 1,
      defaultMaxRouteDistanceCells: 5,
      detectionMode: "INDEPENDENT",
      visibilityRecalculationMode: "ON_DROP",
      allowPlayersToCreateRoutes: true,
      allowPlayersToStartOwnArmies: true,
      movementUpdateRate: 5,
      visibilityUpdateRate: 4,
      interpolationEnabled: true,
      populationTimeZone: "Europe/Moscow",
      humanResourceApiUrl: "https://example.test/lr",
      humanResourceApiToken: "token"
    },
    turn: {
      turnNumber: 3,
      phase: "MOVEMENT",
      autoTurnsPaused: false,
      deferredUntil: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      lastProcessedBoundaryId: null
    },
    sides: [],
    states: [
      { id: "state-1", name: "Государство", color: "#fff", rulingFactionId: null, active: true, backendCountry: "country-a" }
    ],
    demographics: [
      {
        stateId: "state-1",
        population: 1000,
        populationGrowthFactor: 1.003,
        humanResource: 100,
        conscriptionLawId: "URGENT_CONSCRIPTION",
        conscriptionRate: 0.04,
        humanResourceCapacity: 100,
        lastPopulationCalculationDate: null
      }
    ],
    conscriptionLaws: [],
    lrTransactions: [],
    battleGroups: [],
    stateRelations: {},
    strategicCities: [],
    wars: [],
    gridMap: { version: 1, width: 1, height: 1, defaultTerrainId: "plain", chunks: {} },
    terrain: { defaultTerrainId: "plain", types: {} },
    turnCheckpoint: undefined
  } as unknown as SceneState;
}

describe("human resource sheet gateway", () => {
  it("posts a snapshot request and validates the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        states: [{ country: "country-a", population: 1001, humanResource: 100.1 }],
        appliedAt: "2026-10-01T00:06:00.000Z"
      }), { status: 200 })
    );
    const gateway = new HumanResourceSheetGateway({
      url: "https://example.test/lr",
      token: "token",
      fetcher
    });

    const result = await gateway.snapshot();

    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/lr",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.states[0]).toEqual({
      country: "country-a",
      population: 1001,
      humanResource: 100.1
    });
  });

  it("returns structured API errors with the authoritative snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: false,
        code: "INSUFFICIENT_HUMAN_RESOURCE",
        states: [{ country: "country-a", population: 900, humanResource: 3 }]
      }), { status: 200 })
    );
    const gateway = new HumanResourceSheetGateway({
      url: "https://example.test/lr",
      token: "token",
      fetcher
    });

    await expect(gateway.spendBatch("request-1", [{
      country: "country-a",
      amount: 5
    }])).rejects.toMatchObject({
      code: "INSUFFICIENT_HUMAN_RESOURCE",
      states: [{ country: "country-a", humanResource: 3 }]
    });
  });

  it("applies the sheet snapshot without touching the derived LR formula", () => {
    const updated = applyHumanResourceSheetSnapshot(scene(), {
      states: [{ country: "country-a", population: 1100, humanResource: 105 }]
    });

    expect(updated.demographics?.[0]).toMatchObject({
      population: 1100,
      humanResource: 105
    });
    expect(updated.revision).toBe(7);
  });

  it("calculates LR spend from the authoritative before/after snapshots", () => {
    const before = scene();
    const after = structuredClone(before);
    const afterDemography = after.demographics?.[0];
    if (!afterDemography) throw new Error("missing demography");
    afterDemography.humanResource = 95;

    expect(humanResourceSpendsBetween(before, after)).toEqual([{
      stateId: "state-1",
      country: "country-a",
      amount: 5,
      stateName: "Государство"
    }]);
  });

  it("fails closed when a state has no backend country mapping", () => {
    const before = scene();
    const after = structuredClone(before);
    const afterDemography = after.demographics?.[0];
    const afterState = after.states[0];
    if (!afterDemography || !afterState) throw new Error("missing state data");
    afterDemography.humanResource = 95;
    afterState.backendCountry = null;

    expect(() => humanResourceSpendsBetween(before, after)).toThrowError(
      new HumanResourceSheetError("STATE_BACKEND_COUNTRY_MISSING", "Государство")
    );
  });
});
