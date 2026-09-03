import { expect, it } from "vitest";
import type { SceneItemRecord } from "../../shared/types";
import {
  ShipRouteOverlayService,
  type ShipRouteOverlayPort,
  type ShipRouteOverlayViewer
} from "./shipRouteOverlayService";

class MemoryOverlayPort implements ShipRouteOverlayPort {
  items: SceneItemRecord[] = [];
  operations: string[] = [];
  next = 0;
  async getLocalItems() { return structuredClone(this.items); }
  async addLocalItems(items: readonly SceneItemRecord[]) {
    this.operations.push(`add:${items.map((item) => item.id).join(",")}`);
    this.items.push(...structuredClone(items));
  }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    this.operations.push(`update:${items.map((item) => item.id).join(",")}`);
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) {
    this.operations.push(`delete:${ids.join(",")}`);
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
  createId() { this.next += 1; return `ship-route-${this.next}`; }
}

function viewer(kind: "GM" | "LEADER" | "MEMBER" | "OTHER"): ShipRouteOverlayViewer {
  return {
    isGM: kind === "GM",
    leaderSideIds: kind === "LEADER" ? ["red"] : []
  };
}

const route = {
  shipId: "ship",
  sideId: "red",
  color: "#f00",
  start: { x: 0.5, y: 0.5 },
  waypoints: [{ x: 1.5, y: 0.5 }, { x: 2.5, y: 0.5 }]
};

it.each([
  ["GM", true],
  ["LEADER", true],
  ["MEMBER", false],
  ["OTHER", false]
] as const)("filters a strategic ship route for %s", async (kind, visible) => {
  const port = new MemoryOverlayPort();
  await new ShipRouteOverlayService(port).reconcile([route], viewer(kind));

  expect(port.items.length > 0).toBe(visible);
  expect(port.items.every((item) => item.disableHit === true)).toBe(true);
  if (visible) {
    expect(port.items.find((item) => item.type === "CURVE")?.points).toEqual([
      route.start,
      ...route.waypoints
    ]);
    expect(port.items.filter((item) => item.type === "LABEL").map((item) => item.text))
      .toEqual(["1 ОП", "2 ОП"]);
  }
});

it("renders no persistent overlay for an empty ship route", async () => {
  const port = new MemoryOverlayPort();
  await new ShipRouteOverlayService(port).reconcile(
    [{ ...route, waypoints: [] }],
    viewer("GM")
  );
  expect(port.items).toEqual([]);
});

it("reconciles an identical ship route without rewriting local items", async () => {
  const port = new MemoryOverlayPort();
  const service = new ShipRouteOverlayService(port);
  await service.reconcile([route], viewer("GM"));
  const ids = port.items.map((item) => item.id);
  port.operations = [];

  await service.reconcile([route], viewer("GM"));

  expect(port.operations).toEqual([]);
  expect(port.items.map((item) => item.id)).toEqual(ids);
});
