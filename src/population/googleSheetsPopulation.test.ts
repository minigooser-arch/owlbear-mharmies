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
      const cells = Array.from({ length: 44 }, () => "");
      for (const [index, value] of Object.entries(values)) cells[Number(index)] = value;
      return cells.map((value) => value.includes(",") ? `"${value.replaceAll('"', '""')}"` : value).join(",");
    };
    const csv = [
      "fff",
      row({ 10: "ВЕЛИКОБРИТАНИЯ", 15: "46М. 084Т.", 43: "0М. 584Т." }),
      row({ 10: "🏳️", 40: "СРОЧНЫЙ ПРИЗЫВ" })
    ].join("\n");

    expect(parseConscriptionCategoryCsv(csv)).toEqual([
      { stateName: "ВЕЛИКОБРИТАНИЯ", category: "СРОЧНЫЙ ПРИЗЫВ", population: 46084, humanResource: 584 }
    ]);
  });
  it("reads AO current LR and AW authoritative capacity from the same 49-column state row", () => {
    const cells = Array.from({ length: 49 }, () => "");
    cells[10] = "ЧЕРНОГОРИЯ";
    cells[15] = "285";
    cells[40] = "41,4704719588";
    cells[48] = "41,4704719588";
    const factionCells = Array.from({ length: 49 }, () => "");
    factionCells[40] = "СРОЧНЫЙ ПРИЗЫВ";
    const csv = [cells.join(";"), factionCells.join(";")].join("\n");
    expect(parseConscriptionCategoryCsv(csv)).toEqual([{
      stateName: "ЧЕРНОГОРИЯ",
      category: "СРОЧНЫЙ ПРИЗЫВ",
      population: 285,
      humanResource: 41.4704719588,
      humanResourceCapacity: 41.4704719588
    }]);
  });

  it("parses paired direct headers and does not invent AW for a legacy 44-column CSV", () => {
    expect(parseConscriptionCategoryCsv(
      "state_name,category,human_resource,human_resource_capacity\nЧЕРНОГОРИЯ,СРОЧНЫЙ ПРИЗЫВ,41.47,50.12\n"
    )).toEqual([{
      stateName: "ЧЕРНОГОРИЯ", category: "СРОЧНЫЙ ПРИЗЫВ",
      humanResource: 41.47, humanResourceCapacity: 50.12
    }]);
    const old = Array.from({ length: 44 }, () => "");
    old[10] = "ГОСУДАРСТВО";
    old[15] = "46084";
    old[40] = "584";
    const category = Array.from({ length: 44 }, () => "");
    category[40] = "СРОЧНЫЙ ПРИЗЫВ";
    expect(parseConscriptionCategoryCsv([old.join(","), category.join(",")].join("\n"))).toEqual([{
      stateName: "ГОСУДАРСТВО", category: "СРОЧНЫЙ ПРИЗЫВ",
      population: 46084, humanResource: 584
    }]);
  });

});
