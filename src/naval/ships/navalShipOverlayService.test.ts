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

describe("naval ship overlays", () => {
  it("renders the ship name in faction color and HP below the ship", async () => {
    const port = new MemoryPort();
    const service = new NavalShipOverlayService(port);

    await service.reconcile([{
      shipId: "ship-a",
      name: "Аврора",
      position: { x: 100, y: 200 },
      hp: 18,
      maxHp: 20,
      color: "#c62828"
    }], new Set(["ship-a"]));

    expect(port.items).toHaveLength(2);
    const name = port.items.find((item) => item.text === "Аврора");
    const hp = port.items.find((item) => item.text === "♥ 18 / 20");
    expect(name).toMatchObject({
      type: "LABEL",
      position: { x: 100, y: 172 },
      color: "#c62828",
      visible: true,
      disableHit: true
    });
    expect(hp).toMatchObject({
      type: "LABEL",
      position: { x: 100, y: 228 },
      color: "#c62828",
      visible: true,
      disableHit: true
    });
  });

  it("uses warning colors for damaged ships while keeping the name in faction color", async () => {
    const port = new MemoryPort();
    const service = new NavalShipOverlayService(port);
    await service.reconcile([{
      shipId: "ship-a",
      name: "Аврора",
      position: { x: 0, y: 0 },
      hp: 5,
      maxHp: 20,
      color: "#1565c0"
    }], new Set(["ship-a"]));

    expect(port.items.find((item) => item.text === "Аврора")?.color).toBe("#1565c0");
    expect(port.items.find((item) => item.text === "♥ 5 / 20")?.color).toBe("#ff6b6b");
  });

  it("creates no labels for ships hidden from the current player", async () => {
    const port = new MemoryPort();
    const service = new NavalShipOverlayService(port);
    await service.reconcile([{
      shipId: "ship-a",
      name: "Аврора",
      position: { x: 0, y: 0 },
      hp: 20,
      maxHp: 20,
      color: "#1565c0"
    }], new Set());
    expect(port.items).toEqual([]);
  });

  it("updates existing labels instead of duplicating them", async () => {
    const port = new MemoryPort();
    const service = new NavalShipOverlayService(port);
    const base = {
      shipId: "ship-a",
      name: "Аврора",
      position: { x: 0, y: 0 },
      hp: 20,
      maxHp: 20,
      color: "#1565c0"
    };
    await service.reconcile([base], new Set(["ship-a"]));
    await service.reconcile([{ ...base, hp: 13, position: { x: 10, y: 20 } }], new Set(["ship-a"]));

    expect(port.items).toHaveLength(2);
    expect(port.items.find((item) => item.text === "♥ 13 / 20")?.position).toEqual({ x: 10, y: 48 });
  });

  it("removes both labels when a previously visible ship becomes hidden", async () => {
    const port = new MemoryPort();
    const service = new NavalShipOverlayService(port);
    const ship = {
      shipId: "ship-a",
      name: "Аврора",
      position: { x: 0, y: 0 },
      hp: 20,
      maxHp: 20,
      color: "#1565c0"
    };
    await service.reconcile([ship], new Set(["ship-a"]));
    await service.reconcile([ship], new Set());
    expect(port.items).toEqual([]);
  });
});
