import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord, SceneState } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { registerArmy, RegistrationError, type RegistrationPort } from "./registration";

class MemoryRegistrationPort implements RegistrationPort {
  role: "GM" | "PLAYER" = "GM";
  item: SceneItemRecord = { id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: {} };
  scene: SceneState = {
    version: 1,
    revision: 0,
    settings: DEFAULT_SETTINGS,
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [] }],
    relations: {},
    battleGroups: []
  };

  async getRole() { return this.role; }
  async getItem() { return structuredClone(this.item); }
  async getSceneState() { return structuredClone(this.scene); }
  async updateItem(_id: string, update: ItemUpdate) { Object.assign(this.item, structuredClone(update)); }
  async deleteLocalItemsForSource() { return undefined; }
}

describe("army registration", () => {
  it("hides an image source and writes namespaced army metadata", async () => {
    const port = new MemoryRegistrationPort();
    const state = await registerArmy(port, "army", "red", "owner");
    expect(port.item.visible).toBe(false);
    expect(port.item.metadata[METADATA_KEYS.army]).toEqual(state);
    expect(state.directOwnerPlayerId).toBe("owner");
  });

  it("rejects registration for a player or non-image item", async () => {
    const playerPort = new MemoryRegistrationPort();
    playerPort.role = "PLAYER";
    await expect(registerArmy(playerPort, "army", "red")).rejects.toEqual(new RegistrationError("GM_ONLY"));
    const shapePort = new MemoryRegistrationPort();
    shapePort.item.type = "SHAPE";
    await expect(registerArmy(shapePort, "army", "red")).rejects.toEqual(new RegistrationError("IMAGE_REQUIRED"));
  });
});
