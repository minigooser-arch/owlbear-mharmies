import { describe, expect, it } from "vitest";
import type { SceneState, StateDemography } from "../shared/types";
import { applyDemographyCorrection, debitHumanResource } from "./humanResourceLedger";

const demography = (overrides: Partial<StateDemography> = {}): StateDemography => ({
  stateId: "state-1",
  population: 1000,
  populationGrowthFactor: 1.003,
  humanResource: 100,
  conscriptionLawId: "GENERAL_MOBILIZATION",
  conscriptionRate: 0.24,
  humanResourceCapacity: 240,
  lastPopulationCalculationDate: "2026-09-28",
  ...overrides
});

const scene = (overrides: Partial<SceneState> = {}): SceneState => ({
  version: 9,
  revision: 1,
  settings: {} as SceneState["settings"],
  sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: "state-1" }],
  states: [{ id: "state-1", name: "Государство", rulingFactionId: "red", active: true }],
  relations: {},
  battleGroups: [],
  terrain: {} as SceneState["terrain"],
  gridMap: {} as SceneState["gridMap"],
  wars: [],
  turn: {} as SceneState["turn"],
  demographics: [demography()],
  conscriptionLaws: [],
  demographyAudit: [],
  lrTransactions: [],
  ...overrides
});

const context = (overrides: Partial<Parameters<typeof debitHumanResource>[3]> = {}) => ({
  requestId: "request-1",
  actorPlayerId: "leader",
  kind: "FORMATION" as const,
  armyId: "army-1",
  armyName: "Первая армия",
  cityId: "city-1",
  cityName: "Столица",
  hp: 5,
  ratePerHp: 5000,
  turnNumber: 1,
  createdAt: "2026-09-28T12:00:00.000Z",
  ...overrides
});

describe("human resource ledger", () => {
  it("debits the shared state balance and records before/after values", () => {
    const result = debitHumanResource(scene(), "red", 25, context());

    expect(result).toMatchObject({
      ok: true,
      demography: { stateId: "state-1", humanResource: 75 },
      transaction: {
        id: "lr-request-1",
        stateId: "state-1",
        stateName: "Государство",
        factionId: "red",
        factionName: "Красные",
        balanceBefore: 100,
        balanceAfter: 75,
        amount: 25
      }
    });
  });

  it("rejects a stateless faction without mutating state", () => {
    const result = debitHumanResource(scene({
      sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }]
    }), "red", 25, context());

    expect(result).toEqual({ ok: false, reason: "STATE_REQUIRED" });
  });

  it("rejects insufficient LR before an army can be changed", () => {
    const result = debitHumanResource(scene({ demographics: [demography({ humanResource: 10 })] }), "red", 25, context());

    expect(result).toEqual({ ok: false, reason: "INSUFFICIENT_HUMAN_RESOURCE" });
  });

  it("does not debit twice when the same request was already recorded", () => {
    const first = debitHumanResource(scene(), "red", 25, context());
    if (!first.ok) throw new Error("first debit should succeed");
    const repeated = debitHumanResource(scene({
      demographics: [first.demography],
      lrTransactions: [first.transaction]
    }), "red", 25, context());

    expect(repeated).toMatchObject({ ok: true, demography: { humanResource: 75 }, transaction: { id: "lr-request-1" } });
  });

  it("returns a separately auditable administrative correction", () => {
    const result = applyDemographyCorrection(demography(), {
      humanResource: 150,
      populationGrowthFactor: 1.004
    }, "Импорт из таблицы", "gm", "2026-09-28T12:00:00.000Z");

    expect(result.record).toMatchObject({ humanResource: 150, populationGrowthFactor: 1.004 });
    expect(result.entry).toMatchObject({
      stateId: "state-1",
      actorPlayerId: "gm",
      reason: "Импорт из таблицы",
      changes: {
        humanResource: { before: 100, after: 150 }
      }
    });
  });
});
