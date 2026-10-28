// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function createHarness() {
  const properties = new Map<string, string>();
  const calls: string[] = [];
  const context: Record<string, unknown> = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties.get(key) ?? null,
        setProperty: (key: string, value: string) => properties.set(key, value)
      })
    },
    SpreadsheetApp: { flush: () => { calls.push("flush"); } }
  };
  const source = readFileSync(new URL("../../apps-script/LetopisSheetWriteback.gs", import.meta.url), "utf8");
  runInNewContext(source, context);
  context.backendIndex_ = () => new Map();
  context.applyFactionAndStateArmy_ = () => { calls.push("factions"); };
  context.applyStateShipCounts_ = () => { calls.push("ships"); };
  context.adjustMilitaryInfluenceBatch_ = () => { calls.push("influence"); };
  const sync = context.syncState_ as (value: unknown) => void;
  return { properties, calls, sync, context };
}

describe("Apps Script sync snapshot fencing", () => {
  it("accepts a fresh snapshot and records its source and revision", () => {
    const test = createHarness();
    test.sync({ sourceId: "scene-1", sourceRevision: 10, stateShips: [{ country: "X", ships: 3 }] });
    expect(test.calls).toEqual(["factions", "ships", "flush"]);
    expect(test.properties.get("OWLBEAR_SYNC_SOURCE_ID")).toBe("scene-1");
    expect(test.properties.get("OWLBEAR_SYNC_LAST_REVISION")).toBe("10");
  });

  it("does not replay an older HP/ship snapshot after a newer one", () => {
    const test = createHarness();
    test.sync({ sourceId: "scene-1", sourceRevision: 10, factions: [{ factionId: "f1", hp: 20 }] });
    test.calls.length = 0;
    test.sync({ sourceId: "scene-1", sourceRevision: 9, stateShips: [{ country: "X", ships: 99 }] });
    expect(test.calls).toEqual([]);
    expect(test.properties.get("OWLBEAR_SYNC_LAST_REVISION")).toBe("10");
  });

  it("preserves independent idempotent influence delivery for old revisions", () => {
    const test = createHarness();
    test.sync({ sourceId: "scene-1", sourceRevision: 10, stateShips: [{ country: "X", ships: 3 }] });
    test.calls.length = 0;
    test.sync({
      sourceId: "scene-1", sourceRevision: 9,
      militaryInfluenceOperations: [{ requestId: "once", reasonCode: "LAND_BATTLE_VICTORY" }]
    });
    expect(test.calls).toEqual(["influence"]);
  });

  it("rejects a foreign Owlbear scene and missing source identity", () => {
    const test = createHarness();
    test.sync({ sourceId: "scene-1", sourceRevision: 3, stateShips: [{ country: "X", ships: 1 }] });
    expect(() => test.sync({ sourceId: "scene-2", sourceRevision: 4, stateShips: [{ country: "X", ships: 1 }] }))
      .toThrow("SYNC_FOREIGN_SOURCE");
    expect(() => test.sync({ sourceRevision: 4, stateShips: [{ country: "X", ships: 1 }] }))
      .toThrow("SYNC_SOURCE_ID_REQUIRED");
  });
  it("cancels applied LR exactly once and fences a delayed replay", () => {
    const test = createHarness();
    const headers = ["requestId", "operationType", "reasonCode", "status"];
    const rows = [
      [...headers],
      ["request-1", "LR", "LR_V2", "APPLIED"]
    ];
    const sheet = {
      getLastRow: () => rows.length,
      getRange: (row: number, col: number, count = 1, width = 1) => ({
        getValues: () => rows.slice(row - 1, row - 1 + count)
          .map((line) => line.slice(col - 1, col - 1 + width)),
        setValue: (value: string) => {
          const target = rows[row - 1];
          if (!target) throw new Error("Test cell row missing");
          target[col - 1] = value;
        },
        setValues: (values: string[][]) => {
          for (const [index, value] of values.entries()) rows[row - 1 + index] = [...value];
        }
      })
    };
    test.context.lrLogSheet_ = () => ({ sheet, headers });
    const cancel = test.context.cancelLRBatch_ as (ids: string[]) => { cancelled: string[] };
    expect(cancel(["request-1"]).cancelled).toEqual(["request-1"]);
    expect(rows[1]?.[3]).toBe("CANCELLED");
    expect(cancel(["request-1"]).cancelled).toEqual(["request-1"]);
    expect(rows).toHaveLength(2);
    expect(cancel(["request-2"]).cancelled).toEqual(["request-2"]);
    expect(rows[2]?.[0]).toBe("request-2");
    expect(rows[2]?.[3]).toBe("CANCELLED");
  });

});
