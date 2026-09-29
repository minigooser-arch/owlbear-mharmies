import { describe, expect, it } from "vitest";
import { parseBackendPopulationCsv, parseConscriptionCategoryCsv } from "./googleSheetsPopulation";

describe("Google Sheets population CSV", () => {
  it("reads the backend headers and quoted comma decimals", () => {
    const csv = [
      "country,uuid,population,growth_rate",
      "russian_empire,,170223,1.003",
      "german_empire,abc,66171,\"1,004\""
    ].join("\n");

    expect(parseBackendPopulationCsv(csv)).toEqual([
      { country: "russian_empire", population: 170223, growthRate: 1.003 },
      { country: "german_empire", population: 66171, growthRate: 1.004 }
    ]);
  });

  it("supports semicolon-delimited exports and skips malformed rows", () => {
    const csv = [
      "country;population;growth_rate",
      "france;40357;1,003",
      "missing-population;;1.003",
      "bad-growth;100;not-a-number",
      ";200;1.003"
    ].join("\n");

    expect(parseBackendPopulationCsv(csv)).toEqual([
      { country: "france", population: 40357, growthRate: 1.003 }
    ]);
  });

  it("returns an empty list when required headers are absent", () => {
    expect(parseBackendPopulationCsv("country,gdp\nrussia,12")).toEqual([]);
  });

  it("reads conscription category from paired state and faction rows", () => {
    const row = (values: Record<number, string>) => {
      const cells = Array.from({ length: 41 }, () => "");
      for (const [index, value] of Object.entries(values)) cells[Number(index)] = value;
      return cells.map((value) => value.includes(",") ? `"${value.replaceAll('"', '""')}"` : value).join(",");
    };
    const csv = [
      row({ 10: "ВЕЛИКОБРИТАНИЯ", 15: "46084", 40: "0М. 584Т." }),
      row({ 10: "🏳️", 40: "СРОЧНЫЙ ПРИЗЫВ" })
    ].join("\n");

    expect(parseConscriptionCategoryCsv(csv)).toEqual([
      { stateName: "ВЕЛИКОБРИТАНИЯ", category: "СРОЧНЫЙ ПРИЗЫВ", humanResource: 584 }
    ]);
  });
});
