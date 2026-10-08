import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface SpendOp {
  requestId: string;
  country: string;
  hp: number;
  ratePerHp: number;
  amount: number;
  kind: string;
  armyId: string;
  armyName: string;
  cityId: string;
  cityName: string;
  actorPlayerId: string;
  turnNumber: number;
}
interface SpendResult {
  operations: Array<{ requestId: string; humanResourceBefore: number; humanResourceAfter: number }>;
  states: Array<{ humanResource: number; humanResourceCapacity: number; population: number }>;
}
function buildFixture() {
  const headers = [
    "requestId", "createdAt", "country", "stateId", "stateName", "kind",
    "hp", "ratePerHp", "amount", "amountPeople", "populationBefore",
    "populationAfter", "humanResourceBefore", "humanResourceAfter",
    "armyId", "armyName", "cityId", "cityName", "actorPlayerId",
    "turnNumber", "batchRequestId", "status", "operationType",
    "factionId", "factionName", "influenceDelta", "influenceBefore",
    "influenceAfter", "reasonCode"
  ];
  const oldRow = Array<unknown>(headers.length).fill("");
  oldRow[0] = "legacy";
  oldRow[2] = "united_kingdom";
  oldRow[8] = 200;
  oldRow[21] = "APPLIED";
  oldRow[22] = "LR";
  const logRows: unknown[][] = [headers, oldRow];
  const population = 47142;
  const potential = 590.7337890766102;
  const readSpent = () => logRows.slice(1).reduce<number>((total, row) =>
    row[21] === "APPLIED" && row[22] === "LR" && row[28] === "LR_V2"
      ? total + Number(row[8])
      : total, 0);
  const logSheet = {
    getLastRow: () => logRows.length,
    getRange(row: number, col: number, height = 1, width = 1) {
      return {
        getValues: () => Array.from({ length: height }, (_, i) =>
          (logRows[row - 1 + i] ?? []).slice(col - 1, col - 1 + width)),
        setValues: (rows: unknown[][]) => {
          for (let i = 0; i < rows.length; i++) logRows[row - 1 + i] = rows[i] ?? [];
        }
      };
    }
  };
  const backend = {
    getRange: (row: number, col: number) => ({
      getValue: () => {
        if (row !== 6 || col !== 3) throw new Error("UNEXPECTED_POPULATION_READ");
        return population;
      },
      setValue: () => { throw new Error("POPULATION_MUST_NOT_BE_CHANGED"); }
    })
  };
  const sandbox = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "true" }) },
    SpreadsheetApp: { flush: () => undefined }
  };
  const source = readFileSync(new URL("../../apps-script/LetopisSheetWriteback.gs", import.meta.url), "utf8");
  const api = runInNewContext(source + `
backendIndex_ = () => new Map([["united_kingdom", { row: 6, stateRow: 9 }]]);
backendSheet_ = () => __backend;
lrLogSheet_ = () => __schema;
stateContext_ = () => ({
  country: "united_kingdom", stateName: "ВЕЛИКОБРИТАНИЯ",
  humanResource: __getAvailable(), humanResourceCapacity: __potential,
  conscriptionRate: 0.04
});
({ spendLRBatch_ });
`, { ...sandbox, __backend: backend, __schema: { sheet: logSheet, headers }, __getAvailable: () => Math.max(0, potential - readSpent()), __potential: potential }) as {
    spendLRBatch_: (ops: SpendOp[], batchId: string) => SpendResult
  };
  const operation = (requestId: string, hp = 25): SpendOp => ({
    requestId, country: "united_kingdom", hp, ratePerHp: 10, amount: hp * 10,
    kind: "FORMATION", armyId: "army-" + requestId, armyName: "Army",
    cityId: "london", cityName: "Лондон", actorPlayerId: "gm", turnNumber: 4
  });
  return { api, operation, logRows, population, potential };
}

describe("bound Apps Script LR_V2 spending", () => {
  it("ignores historical APPLIED entries, debits only LR and preserves population", () => {
    const { api, operation, logRows, population, potential } = buildFixture();
    const result = api.spendLRBatch_([operation("v2-first")], "batch-1");
    expect(result.states[0]?.population).toBe(population);
    expect(result.states[0]?.humanResourceCapacity).toBeCloseTo(potential);
    expect(result.states[0]?.humanResource).toBeCloseTo(potential - 250);
    expect(result.operations[0]?.humanResourceBefore).toBeCloseTo(potential);
    expect(result.operations[0]?.humanResourceAfter).toBeCloseTo(potential - 250);
    expect(logRows).toHaveLength(3);
    expect(logRows[2]?.[28]).toBe("LR_V2");
    expect(logRows[2]?.[10]).toBe(population);
    expect(logRows[2]?.[11]).toBe(population);
  });

  it("does not duplicate charge after retrying the same requestId", () => {
    const { api, operation, logRows } = buildFixture();
    api.spendLRBatch_([operation("retry")], "batch-1");
    api.spendLRBatch_([operation("retry")], "batch-1");
    expect(logRows).toHaveLength(3);
  });

  it("rejects an insufficient balance and an overdrawn multi-operation batch atomically", () => {
    const { api, operation, logRows } = buildFixture();
    expect(() => api.spendLRBatch_([operation("too-much", 70)], "batch-bad")).toThrow(/INSUFFICIENT_LR/);
    expect(() => api.spendLRBatch_([operation("a", 30), operation("b", 30)], "batch-bad-2"))
      .toThrow(/INSUFFICIENT_LR/);
    expect(logRows).toHaveLength(2);
  });
});
