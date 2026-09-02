import { describe, expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { HealthOverlayService } from "./healthOverlayService";

class Port {
  localItems: SceneItemRecord[] = [];
  next = 0;
  async getLocalItems() { return structuredClone(this.localItems); }
  async addLocalItems(items: readonly SceneItemRecord[]) { this.localItems.push(...structuredClone(items)); }
  async updateLocalItems(items: readonly SceneItemRecord[]) { for (const item of items) { const index = this.localItems.findIndex((current) => current.id === item.id); if (index >= 0) this.localItems[index] = structuredClone(item); } }
  async deleteLocalItems(ids: readonly string[]) { this.localItems = this.localItems.filter((item) => !ids.includes(item.id)); }
  createId() { this.next += 1; return `health-${this.next}`; }
}

describe("HealthOverlayService", () => {
  it("shows HP below only visible armies", async () => {
    const port = new Port();
    await new HealthOverlayService(port).reconcile([
      { armyId: "a", position: { x: 100, y: 200 }, hp: 43, maxHp: 50, color: "#f00" },
      { armyId: "b", position: { x: 300, y: 400 }, hp: 50, maxHp: 50, color: "#00f" }
    ], new Set(["a"]));
    expect(port.localItems).toHaveLength(1);
    expect(port.localItems[0]).toMatchObject({ type: "LABEL", position: { x: 100, y: 228 }, text: "♥ 43 / 50" });
  });

  it("updates and removes labels as HP and visibility change", async () => {
    const port = new Port();
    const service = new HealthOverlayService(port);
    await service.reconcile([{ armyId: "a", position: { x: 0, y: 0 }, hp: 50, maxHp: 50, color: "#f00" }], new Set(["a"]));
    await service.reconcile([{ armyId: "a", position: { x: 0, y: 0 }, hp: 25, maxHp: 50, color: "#f00" }], new Set(["a"]));
    expect(port.localItems[0]?.text).toBe("♥ 25 / 50");
    await service.reconcile([], new Set());
    expect(port.localItems).toEqual([]);
  });
});
