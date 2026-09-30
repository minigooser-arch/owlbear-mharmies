import { describe, expect, it, vi } from "vitest";
import type { ConscriptionLaw, StateEntity } from "../shared/types";
import { buildPopulationSyncPlan, syncPopulationFromPublicSheet } from "./populationSheetSync";

const states: StateEntity[] = [
  { id: "state-1", name: "Государство", rulingFactionId: null, active: true, backendCountry: "country-a" },
  { id: "state-2", name: "Без соответствия", rulingFactionId: null, active: true, backendCountry: "missing" }
];
const matchedState = states[0];
if (!matchedState) throw new Error("Test fixture is empty");

describe("population sheet sync", () => {
  it("maps backend country keys to state ids and reports unmatched states", () => {
    const result = buildPopulationSyncPlan([
      { country: "country-a", population: 2_000_000, growthRate: 1.01 }
    ], states);

    expect(result.entries).toEqual([{ stateId: "state-1", country: "country-a", population: 2_000_000, populationGrowthFactor: 1.01 }]);
    expect(result.unmatchedStates).toEqual(["state-2"]);
  });

  it("fetches the public csv and applies only population fields", async () => {
    const applyCorrection = vi.fn().mockResolvedValue(undefined);
    const result = await syncPopulationFromPublicSheet({
      csvUrl: "https://example.test/backend.csv",
      states: [matchedState],
      demographics: [],
      fetcher: vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "country,population,growth_rate\ncountry-a,3000000,1.02\n" }),
      applyCorrection
    });

    expect(result).toMatchObject({ applied: 1, unmatchedStates: [], errors: [] });
    expect(applyCorrection).toHaveBeenCalledWith("state-1", {
      population: 3_000_000,
      populationGrowthFactor: 1.02
    });
  });

  it("does not apply duplicate or failed rows and reports errors", async () => {
    const applyCorrection = vi.fn().mockRejectedValue(new Error("write failed"));
    const result = await syncPopulationFromPublicSheet({
      csvUrl: "https://example.test/backend.csv",
      states: [matchedState],
      demographics: [],
      fetcher: vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "country,population,growth_rate\ncountry-a,3000000,1.02\ncountry-a,4000000,1.03\n" }),
      applyCorrection
    });

    expect(result.applied).toBe(0);
    expect(result.skippedRows).toContain("country-a:duplicate");
    expect(result.errors).toContain("state-1: write failed");
  });

  it("reports a malformed csv instead of silently claiming success", async () => {
    const result = await syncPopulationFromPublicSheet({
      csvUrl: "https://example.test/backend.csv",
      states: [],
      demographics: [],
      fetcher: vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "wrong,headers\nvalue,1\n" }),
      applyCorrection: vi.fn()
    });

    expect(result.applied).toBe(0);
    expect(result.errors).toContain("В CSV не найдены строки с заголовками country, population, growth_rate");
  });

  it("imports a matching conscription category from the states sheet", async () => {
    const laws: ConscriptionLaw[] = [{ id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.04, active: true }];
    const applyCorrection = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => url.includes("backend")
        ? "country,population,growth_rate\ncountry-a,3000000,1.02\n"
        : "state_name,category\nГосударство,СРОЧНЫЙ ПРИЗЫВ\n"
    }));

    const result = await syncPopulationFromPublicSheet({
      csvUrl: "https://example.test/backend.csv",
      conscriptionCsvUrl: "https://example.test/states.csv",
      states: [{ ...matchedState, name: "Государство" }],
      demographics: [],
      conscriptionLaws: laws,
      fetcher,
      applyCorrection
    });

    expect(result.conscriptionApplied).toBe(1);
    expect(applyCorrection).toHaveBeenCalledWith("state-1", {
      population: 3_000_000,
      populationGrowthFactor: 1.02,
      conscriptionLawId: "URGENT_CONSCRIPTION",
      conscriptionRate: 0.04
    });
  });

  it("matches a sheet category when it includes the displayed percentage", () => {
    const laws: ConscriptionLaw[] = [{ id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.04, active: true }];
    const result = buildPopulationSyncPlan(
      [{ country: "country-a", population: 3_000_000, growthRate: 1.02 }],
      [{ ...matchedState, name: "Государство" }],
      [{ stateName: "ГОСУДАРСТВО", category: "СРОЧНЫЙ ПРИЗЫВ (4%)" }],
      laws
    );

    expect(result.entries[0]).toMatchObject({ conscriptionLawId: "URGENT_CONSCRIPTION", conscriptionRate: 0.04 });
    expect(result.unmatchedConscriptionStates).toEqual([]);
  });

  it("falls back to the shared population value when state display names differ", () => {
    const laws: ConscriptionLaw[] = [{ id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.04, active: true }];
    const result = buildPopulationSyncPlan(
      [{ country: "country-a", population: 46_084, growthRate: 1.003 }],
      [{ ...matchedState, name: "Другое название" }],
      [{ stateName: "ВЕЛИКОБРИТАНИЯ", population: 46_084, category: "СРОЧНЫЙ ПРИЗЫВ" }],
      laws
    );

    expect(result.entries[0]).toMatchObject({ conscriptionLawId: "URGENT_CONSCRIPTION", conscriptionRate: 0.04 });
    expect(result.unmatchedConscriptionStates).toEqual([]);
  });

  it("imports the current human resource from the formatted state row", async () => {
    const laws: ConscriptionLaw[] = [{ id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.04, active: true }];
    const applyCorrection = vi.fn().mockResolvedValue(undefined);
    const row = (values: Record<number, string>) => {
      const cells = Array.from({ length: 41 }, () => "");
      for (const [index, value] of Object.entries(values)) cells[Number(index)] = value;
      return cells.join(",");
    };
    const fetcher = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => url.includes("backend")
        ? "country,population,growth_rate\ncountry-a,46084,1.003\n"
        : [row({ 10: "Государство", 15: "46084", 40: "0М. 584Т." }), row({ 10: "🏳️", 40: "СРОЧНЫЙ ПРИЗЫВ" })].join("\n")
    }));

    const result = await syncPopulationFromPublicSheet({
      csvUrl: "https://example.test/backend.csv",
      conscriptionCsvUrl: "https://example.test/states.csv",
      states: [{ ...matchedState, name: "Государство" }],
      demographics: [],
      conscriptionLaws: laws,
      fetcher,
      applyCorrection
    });

    expect(applyCorrection).toHaveBeenCalledWith("state-1", {
      population: 46_084,
      populationGrowthFactor: 1.003,
      humanResource: 584,
      conscriptionLawId: "URGENT_CONSCRIPTION",
      conscriptionRate: 0.04
    });
    expect(result.humanResourceApplied).toBe(1);
  });

  it("can apply the complete sheet plan as one correction package", async () => {
    const applyCorrections = vi.fn().mockResolvedValue(undefined);
    const result = await syncPopulationFromPublicSheet({
      csvUrl: "https://example.test/backend.csv",
      states: [matchedState],
      demographics: [],
      fetcher: vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "country,population,growth_rate\ncountry-a,3000000,1.02\n" }),
      applyCorrection: vi.fn(),
      applyCorrections
    });

    expect(result.applied).toBe(1);
    expect(applyCorrections).toHaveBeenCalledTimes(1);
    expect(applyCorrections.mock.calls[0]?.[0]).toEqual([{
      stateId: "state-1",
      patch: { population: 3_000_000, populationGrowthFactor: 1.02 }
    }]);
  });
});

