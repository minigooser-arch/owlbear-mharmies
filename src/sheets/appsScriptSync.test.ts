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
  const actualApplyFactionAndStateArmy = context.applyFactionAndStateArmy_;
  context.backendIndex_ = () => new Map();
  context.applyFactionAndStateArmy_ = () => { calls.push("factions"); };
  context.applyStateShipCounts_ = () => { calls.push("ships"); };
  context.adjustMilitaryInfluenceBatch_ = () => { calls.push("influence"); };
  const sync = context.syncState_ as (value: unknown) => void;
  return { properties, calls, sync, context, actualApplyFactionAndStateArmy };
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

  it("skips only unregistered factions without masking ambiguous matches", () => {
    const test = createHarness();
    const resolve = test.context.resolveRegisteredFactionTarget_ as (
      faction: { factionId: string; factionName: string; country: string },
      rows: { row: number; id: string; name: string; country: string }[]
    ) => { row: number } | null;
    const known = { row: 25, id: "italian-faction", name: "Либеральная коалиция", country: "italy" };
    const input = { factionId: "unknown-id", factionName: "Дом Габсбургских-Лотарингских", country: "austria_hungary" };
    expect(resolve(input, [known])).toBeNull();
    expect(resolve({ factionId: "italian-faction", factionName: "Либеральная коалиция", country: "italy" }, [known]))
      .toEqual(known);
    expect(() => resolve(
      { factionId: "unmapped", factionName: "Двойник", country: "italy" },
      [
        { row: 9, id: "", name: "Двойник", country: "italy" },
        { row: 13, id: "", name: "Двойник", country: "italy" }
      ]
    )).toThrow("FACTION_AMBIGUOUS");
  });

  it("applies HP for a mapped faction but never overwrites manually edited influence", () => {
    const test = createHarness();
    const cells = new Map<string, string | number>([
      ["25:53", "italian-faction"], ["25:54", "italy"],
      ["25:45", 20], ["25:35", 90]
    ]);
    const writes: string[] = [];
    const sheet = {
      getRange: (row: number, col: number) => ({
        getValue: () => cells.get(`${row}:${col}`) ?? "",
        setValue: (value: string | number) => {
          writes.push(`${row}:${col}`);
          cells.set(`${row}:${col}`, value);
        },
        setValues: (values: (string | number)[][]) => {
          values[0]?.forEach((value, index) => {
            writes.push(`${row}:${col + index}`);
            cells.set(`${row}:${col + index}`, value);
          });
        }
      })
    };
    test.context.factionSheet_ = () => sheet;
    test.context.factionRows_ = () => [{ row: 25, id: "italian-faction", name: "Либеральная коалиция", country: "italy" }];
    test.context.stateSheet_ = () => sheet;
    const apply = test.actualApplyFactionAndStateArmy as (
      event: unknown,
      index: Map<string, { stateRow: number }>
    ) => void;
    apply({
      factions: [
        { factionId: "unknown-id", factionName: "Дом Габсбургских-Лотарингских",
          country: "austria_hungary", hp: 5, maxHp: 40, militaryInfluence: 2 },
        { factionId: "italian-faction", factionName: "Либеральная коалиция",
          country: "italy", hp: 25, maxHp: 40, militaryInfluence: 2 }
      ]
    }, new Map([["italy", { stateRow: 29 }], ["austria_hungary", { stateRow: 33 }]]));
    expect(cells.get("25:45")).toBe(25);
    expect(cells.get("25:35")).toBe(90);
    expect(writes).not.toContain("25:35");
  });

  it("reads military influence for mapped factions while skipping unlisted ones", () => {
    const test = createHarness();
    test.context.factionRows_ = () => [
      { row: 25, id: "italian-faction", name: "Либеральная коалиция", country: "italy" }
    ];
    test.context.factionSheet_ = () => ({
      getRange: () => ({ getValue: () => 47 })
    });
    const read = test.context.getFactionInfluenceSnapshots_ as (
      rows: unknown[]
    ) => { factionId: string; militaryInfluence: number }[];
    const result = read([
      { factionId: "unknown-id", factionName: "Дом Габсбургских-Лотарингских", country: "austria_hungary" },
      { factionId: "italian-faction", factionName: "Либеральная коалиция", country: "italy" }
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.factionId).toBe("italian-faction");
    expect(result[0]?.militaryInfluence).toBe(47);
  });

});
