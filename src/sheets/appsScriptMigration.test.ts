import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Cell = { formula: string; value: number | string };
type Row = { ao: Cell; aw: Cell };
function fixture(options: { conflictingAW?: boolean; failOnSecond?: boolean; spent?: number } = {}) {
  const cells: Record<number, Row> = {
    9: { ao: { formula: "=100", value: 100 }, aw: { formula: "", value: "" } },
    13: { ao: { formula: "=60", value: 60 }, aw: { formula: "", value: options.conflictingAW ? "reserved" : "" } }
  };
  let hidden = false;
  let enabled = false;
  const updateValue = (row: number, col: number) => {
    const value = cells[row]![col === 41 ? "ao" : "aw"];
    if (value.formula === "=100" || value.formula === "=60") value.value = Number(value.formula.slice(1));
    if (value.formula.includes('"LR_V2"')) {
      value.value = Math.max(0, Number(cells[row]!.aw.value) - (row === 9 ? options.spent ?? 0 : 0));
    }
  };
  const sheet = {
    getRange(row: number, col: number) {
      if (!cells[row] || (col !== 41 && col !== 49)) throw Error("BAD_CELL");
      const cell = cells[row]![col === 41 ? "ao" : "aw"];
      return {
        getFormula: () => cell.formula,
        getValue: () => cell.value,
        setFormula(formula: string) {
          if (options.failOnSecond && row === 13 && col === 41 && formula.includes('"LR_V2"')) {
            throw Error("INJECTED_WRITE_FAILURE");
          }
          cell.formula = formula;
          updateValue(row, col);
        },
        setValue(value: number | string) { cell.formula = ""; cell.value = value; }
      };
    },
    hideColumns(index: number) {
      if (index !== 49) throw Error("BAD_HIDE_COLUMN");
      hidden = true;
    }
  };
  const source = readFileSync(new URL("../../apps-script/LetopisSheetWriteback.gs", import.meta.url), "utf8");
  const api = runInNewContext(source + `
    withScriptLock_ = (fn) => fn();
    backendIndex_ = () => new Map([
      ["united_kingdom", { row: 6, stateRow: 9 }],
      ["bulgaria", { row: 5, stateRow: 13 }]
    ]);
    stateSheet_ = () => __sheet;
    lrLogSheet_ = () => ({});
    lrV2SpentByCountry_ = () => new Map([["united_kingdom", __spent]]);
    installLrV2Formulas;
  `, {
    __sheet: sheet,
    __spent: options.spent ?? 0,
    SpreadsheetApp: { flush: () => undefined },
    PropertiesService: { getScriptProperties: () => ({
      setProperty: (key: string, value: string) => {
        if (key === "LR_V2_ENABLED" && value === "true") enabled = true;
      }
    }) },
    console
  }) as () => void;
  return { run: api, cells, get enabled() { return enabled; }, get hidden() { return hidden; } };
}

describe("Apps Script LR V2 formula migration", () => {
  it("preflights all countries and never overwrites an occupied AW cell", () => {
    const test = fixture({ conflictingAW: true });
    expect(() => test.run()).toThrow(/LR_V2_CAPACITY_CONFLICT:bulgaria/);
    expect(test.cells[9]!.ao.formula).toBe("=100");
    expect(test.cells[9]!.aw.formula).toBe("");
    expect(test.cells[13]!.aw.value).toBe("reserved");
    expect(test.enabled).toBe(false);
  });

  it("installs LR subtraction without touching population, and reruns idempotently", () => {
    const test = fixture({ spent: 25 });
    test.run();
    expect(test.enabled).toBe(true);
    expect(test.hidden).toBe(true);
    expect(test.cells[9]!.aw.formula).toBe("=100");
    expect(test.cells[9]!.ao.value).toBe(75);
    expect(test.cells[13]!.ao.value).toBe(60);
    expect(() => test.run()).not.toThrow();
    expect(test.cells[9]!.ao.value).toBe(75);
  });

  it("reverts partial migration if a write fails", () => {
    const test = fixture({ failOnSecond: true });
    expect(() => test.run()).toThrow("INJECTED_WRITE_FAILURE");
    expect(test.cells[9]!.ao.formula).toBe("=100");
    expect(test.cells[9]!.aw.formula).toBe("");
    expect(test.cells[13]!.ao.formula).toBe("=60");
    expect(test.cells[13]!.aw.value).toBe("");
    expect(test.enabled).toBe(false);
  });
});
