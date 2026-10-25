import { beforeEach, describe, expect, it } from "vitest";
import { performanceSnapshot, resetPerformance } from "../performance/metrics";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { SceneItemChangeGate } from "./sceneItemChangeGate";
import { createEntityInteractionProxy } from "./entityInteractionProxy";

function item(id: string, metadata: Record<string, unknown> = {}, type = "IMAGE"): SceneItemRecord {
  return { id, type, position: { x: 0, y: 0 }, metadata };
}
const proxy = (id: string, sourceItem = item("army", { [METADATA_KEYS.army]: { revision: 1 } })): SceneItemRecord =>
  createEntityInteractionProxy(sourceItem, () => id);
const legacyOverlay = (id: string): SceneItemRecord =>
  item(id, { [METADATA_KEYS.mapOverlay]: { key: id } }, "CURVE");

describe("scene item change gate", () => {
  beforeEach(resetPerformance);

  it("always passes the first event and forwards any gameplay changes", () => {
    const gate = new SceneItemChangeGate();
    const original = [item("army", { [METADATA_KEYS.army]: { revision: 1 } })];
    expect(gate.shouldRefresh(original)).toBe(true);
    expect(gate.shouldRefresh(structuredClone(original))).toBe(false);
    const moved = structuredClone(original);
    const moving = moved[0];
    if (!moving) throw new Error("Missing moving army");
    moving.position.x = 100;
    expect(gate.shouldRefresh(moved)).toBe(true);
    const edited = structuredClone(moved);
    const changing = edited[0];
    if (!changing) throw new Error("Missing edited army");
    changing.metadata[METADATA_KEYS.army] = { revision: 2 };
    expect(gate.shouldRefresh(edited)).toBe(true);
    expect(gate.shouldRefresh([])).toBe(true);
  });

  it("ignores only pure generated cosmetic item additions, moves and removals", () => {
    const gate = new SceneItemChangeGate();
    const source = item("army", { [METADATA_KEYS.army]: { revision: 1 } });
    expect(gate.shouldRefresh([source])).toBe(true);
    expect(gate.shouldRefresh([source, proxy("proxy-1")])).toBe(false);
    expect(gate.shouldRefresh([source, { ...proxy("proxy-1"), position: { x: 300, y: 100 } }])).toBe(false);
    expect(gate.shouldRefresh([source, proxy("proxy-2"), legacyOverlay("old-overlay")])).toBe(false);
    expect(gate.shouldRefresh([source])).toBe(false);
    expect(performanceSnapshot().find(row => row.name === "scene.items.cosmeticOnlySkipped")?.calls).toBe(4);
  });

  it("repairs deleted, displaced and duplicate proxies instead of suppressing the event", () => {
    const gate = new SceneItemChangeGate();
    const army = item("army", { [METADATA_KEYS.army]: { revision: 1 } });
    const healthy = proxy("healthy", army);
    expect(gate.shouldRefresh([army, healthy])).toBe(true);
    expect(gate.shouldRefresh([army, healthy])).toBe(false);

    // A manually deleted hitbox must be recreated by reconciliation.
    expect(gate.shouldRefresh([army])).toBe(true);
    expect(gate.shouldRefresh([army, healthy])).toBe(false);

    const dragged = { ...healthy, position: { x: 1000, y: 1000 } };
    expect(gate.shouldRefresh([army, dragged])).toBe(true);
    expect(gate.shouldRefresh([army, healthy])).toBe(true);

    // A second proxy for the same source is not a valid cosmetic-only event.
    expect(gate.shouldRefresh([army, healthy, proxy("duplicate", army)])).toBe(true);
    expect(gate.shouldRefresh([army, healthy])).toBe(true);
  });

  it("keeps all untagged scene images because ship registration is stored separately", () => {
    const gate = new SceneItemChangeGate();
    const ship = item("ship-without-ship-metadata");
    expect(gate.shouldRefresh([ship])).toBe(true);
    expect(gate.shouldRefresh([{ ...ship, position: { x: 500, y: 100 } }])).toBe(true);
    expect(gate.shouldRefresh([ship])).toBe(true);
  });

  it("does not ignore a proxy that gains gameplay metadata or has an unknown extension field", () => {
    const gate = new SceneItemChangeGate();
    const normal = item("normal");
    expect(gate.shouldRefresh([normal])).toBe(true);
    const spoofed = proxy("proxy");
    spoofed.metadata[METADATA_KEYS.barrier] = { blocksVision: true };
    expect(gate.shouldRefresh([normal, spoofed])).toBe(true);
    expect(gate.shouldRefresh([normal, proxy("proxy")])).toBe(true);
    const unknown = item("unknown", { "foreign-ext/unrecognized": true }, "SHAPE");
    expect(gate.shouldRefresh([normal, unknown])).toBe(true);
  });

  it("resets on scene transitions even if new scene reuses every item ID", () => {
    const gate = new SceneItemChangeGate();
    const items = [item("same-id")];
    expect(gate.shouldRefresh(items)).toBe(true);
    expect(gate.shouldRefresh(items)).toBe(false);
    gate.reset();
    expect(gate.shouldRefresh(items)).toBe(true);
  });

  it("fails open for cyclic data and does not hold oversized scene snapshots", () => {
    const gate = new SceneItemChangeGate();
    const cyclic = item("cyclic");
    cyclic.metadata.self = cyclic;
    expect(gate.shouldRefresh([cyclic])).toBe(true);
    expect(gate.shouldRefresh([cyclic])).toBe(true);
    const big = { ...item("big"), name: "x".repeat(2_000_001) };
    expect(gate.shouldRefresh([big])).toBe(true);
    expect(gate.shouldRefresh([big])).toBe(true);
    expect(gate.shouldRefresh([item("ordinary")])).toBe(true);
  });
});
