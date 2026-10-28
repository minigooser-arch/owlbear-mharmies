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
  const source = readFileSync(new URL("./LetopisSheetWriteback.gs", import.meta.url), "utf8");
  runInNewContext(source, context);
  context.backendIndex_ = () => new Map();
  context.applyFactionAndStateArmy_ = () => { calls.push("factions"); };
  context.applyStateShipCounts_ = () => { calls.push("ships"); };
  context.adjustMilitaryInfluenceBatch_ = () => { calls.push("influence"); };
  const sync = context.syncState_ as (value: unknown) => void;
  return { properties, calls, sync };
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
});
