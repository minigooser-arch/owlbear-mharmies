import { describe, expect, it } from "vitest";
import type { SceneItemRecord } from "../../shared/types";
import {
  NavalShipOverlayService,
  type NavalShipOverlayPort
} from "./navalShipOverlayService";

class MemoryPort implements NavalShipOverlayPort {
  items: SceneItemRecord[] = [];
  private nextId = 0;

  async getLocalItems(): Promise<SceneItemRecord[]> { return structuredClone(this.items); }
  async addLocalItems(items: readonly SceneItemRecord[]): Promise<void> { this.items.push(...structuredClone(items)); }
  async updateLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]): Promise<void> {
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
  createId(): string { this.nextId += 1; return `ship-overlay-${this.nextId}`; }
}

describe("naval ship overlay viewport positioning", () => {
  it("keeps name and HP roughly 28 screen pixels away from the ship at strategic zoom", async () => {
    const port = new MemoryPort();
    const service = new NavalShipOverlayService(port);

    await service.reconcile([{
      shipId: "ship-a",
      name: "Бисмарк",
      position: { x: 1_000, y: 2_000 },
      hp: 30,
      maxHp: 30,
      color: "#c62828"
    }], new Set(["ship-a"]), 0.1);

    const name = port.items.find((item) => item.text === "Бисмарк");
    const hp = port.items.find((item) => item.text === "♥ 30 / 30");

    // Owlbear labels keep their own size in screen space. At viewport scale 0.1,
    // a 28 px visual gap therefore needs 280 scene units, not 28 scene units.
    expect(name?.position).toEqual({ x: 1_000, y: 1_720 });
    expect(hp?.position).toEqual({ x: 1_000, y: 2_280 });
  });
});
