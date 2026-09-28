import { describe, expect, it } from "vitest";
import { DEFAULT_CONSCRIPTION_LAWS } from "../shared/constants";
import type { StateDemography } from "../shared/types";
import { applyPopulationCalendar, applyPopulationCalendarToScene, populationDateInTimeZone, recalculateHumanResourceCapacity } from "./populationRules";

const record = (overrides: Partial<StateDemography> = {}): StateDemography => ({
  stateId: "state-1",
  population: 1000,
  populationGrowthFactor: 1.003,
  humanResource: 200,
  conscriptionLawId: "GENERAL_MOBILIZATION",
  conscriptionRate: 0.24,
  humanResourceCapacity: 240,
  lastPopulationCalculationDate: "2026-09-01",
  ...overrides
});

describe("population calendar rules", () => {
  it("applies the daily growth factor for every missed calendar day", () => {
    const result = applyPopulationCalendar(record(), DEFAULT_CONSCRIPTION_LAWS, {
      today: "2026-09-03",
      timeZone: "Europe/Moscow"
    });

    expect(result.population).toBeCloseTo(1000 * 1.003 ** 2, 8);
    expect(result.lastPopulationCalculationDate).toBe("2026-09-03");
    expect(result.humanResource).toBe(200);
  });

  it("is idempotent when called again for the same date", () => {
    const once = applyPopulationCalendar(record(), DEFAULT_CONSCRIPTION_LAWS, { today: "2026-09-03", timeZone: "UTC" });
    const twice = applyPopulationCalendar(once, DEFAULT_CONSCRIPTION_LAWS, { today: "2026-09-03", timeZone: "UTC" });

    expect(twice).toEqual(once);
  });

  it("does not retroactively grow a newly created record", () => {
    const result = applyPopulationCalendar(record({ lastPopulationCalculationDate: null }), DEFAULT_CONSCRIPTION_LAWS, {
      today: "2026-09-03",
      timeZone: "UTC"
    });

    expect(result.population).toBe(1000);
    expect(result.lastPopulationCalculationDate).toBe("2026-09-03");
  });

  it("clamps current LR when a lower conscription law reduces capacity", () => {
    const result = applyPopulationCalendar(record({
      conscriptionLawId: "PARTIAL_MOBILIZATION",
      conscriptionRate: 0.24,
      humanResource: 230,
      humanResourceCapacity: 240,
      lastPopulationCalculationDate: "2026-09-02"
    }), DEFAULT_CONSCRIPTION_LAWS, { today: "2026-09-03", timeZone: "UTC" });

    expect(result.conscriptionRate).toBe(0.08);
    expect(result.humanResourceCapacity).toBeCloseTo(1003 * 0.08, 8);
    expect(result.humanResource).toBeCloseTo(80, 8);
  });

  it("does not grant LR when a higher law raises capacity", () => {
    const result = recalculateHumanResourceCapacity(record({
      conscriptionLawId: "GENERAL_MOBILIZATION",
      conscriptionRate: 0.04,
      humanResource: 40,
      humanResourceCapacity: 40
    }), DEFAULT_CONSCRIPTION_LAWS);

    expect(result.humanResourceCapacity).toBe(240);
    expect(result.humanResource).toBe(40);
  });

  it("leaves population unchanged for an invalid growth factor while advancing the date", () => {
    const result = applyPopulationCalendar(record({ populationGrowthFactor: 0 }), DEFAULT_CONSCRIPTION_LAWS, {
      today: "2026-09-03",
      timeZone: "UTC"
    });

    expect(result.population).toBe(1000);
    expect(result.lastPopulationCalculationDate).toBe("2026-09-03");
  });

  it("derives the campaign date in the configured timezone", () => {
    expect(populationDateInTimeZone(new Date("2026-09-28T21:30:00.000Z"), "Europe/Moscow")).toBe("2026-09-29");
  });

  it("updates every scene demographic record using the scene timezone", () => {
    const scene = {
      version: 9,
      revision: 1,
      settings: { populationTimeZone: "Europe/Moscow" },
      demographics: [record()],
      conscriptionLaws: DEFAULT_CONSCRIPTION_LAWS
    } as never;

    const updated = applyPopulationCalendarToScene(scene, new Date("2026-09-28T21:30:00.000Z"));

    if (!updated.demographics) throw new Error("demography missing");
    expect(updated.demographics[0]?.lastPopulationCalculationDate).toBe("2026-09-29");
    expect(updated.demographics[0]?.population).toBeCloseTo(1000 * 1.003 ** 28, 5);
  });
});
