import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord, SceneState } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine } from "./application";

class LegacyLeaderPort {
  scene: SceneState;
  sceneItems: SceneItemRecord[];
  localItems: SceneItemRecord[] = [];
  private nextId = 0;

  constructor() {
    const ship = createRegisteredShip("red", "BATTLESHIP", "NORTH");
    this.scene = {
      version: 6,
      revision: 1,
      settings: { ...DEFAULT_SETTINGS },
      sides: [{
        id: "red",
        name: "Красные",
        color: "#2e7d32",
        playerIds: [],
        leaderPlayerIds: ["leader"],
        stateId: null
      }],
      states: [], relations: {}, battleGroups: [],
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: { version: 1, cells: {}, revision: 0 },
      wars: [],
      turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "MOVEMENT" },
      ships: { ship: structuredClone(ship) },
      navalBattleRequests: [], transportEmbarkRequests: [], activeNavalBattle: null,
      navalBattleHistory: [], navalRevealUntilTurn: {}
    };
    this.sceneItems = [{
      id: "ship", type: "IMAGE", name: "Бисмарк", position: { x: 100, y: 100 },
      visible: false, metadata: { [METADATA_KEYS.ship]: structuredClone(ship) }
    }];
  }

  async getSceneMetadata(): Promise<Record<string, unknown>> { return { [METADATA_KEYS.scene]: structuredClone(this.scene) }; }
  async patchSceneMetadata(update: Record<string, unknown>): Promise<void> {
    const next = update[METADATA_KEYS.scene];
    if (next) this.scene = structuredClone(next) as SceneState;
  }
  async getSceneItems(): Promise<SceneItemRecord[]> { return structuredClone(this.sceneItems); }
  async updateSceneItem(id: string, update: ItemUpdate): Promise<void> {
    const item = this.sceneItems.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, structuredClone(update));
  }
  async getLocalItems(): Promise<SceneItemRecord[]> { return structuredClone(this.localItems); }
  async addLocalItem(item: SceneItemRecord): Promise<void> { this.localItems.push(structuredClone(item)); }
  async addLocalItems(items: readonly SceneItemRecord[]): Promise<void> { this.localItems.push(...structuredClone(items)); }
  async updateLocalItem(id: string, update: ItemUpdate): Promise<void> {
    const item = this.localItems.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, structuredClone(update));
  }
  async updateLocalItems(items: readonly SceneItemRecord[]): Promise<void> {
    for (const update of items) {
      const index = this.localItems.findIndex((item) => item.id === update.id);
      if (index >= 0) this.localItems[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]): Promise<void> { this.localItems = this.localItems.filter((item) => !ids.includes(item.id)); }
  createClone(source: SceneItemRecord): SceneItemRecord {
    this.nextId += 1;
    return { ...structuredClone(source), id: `clone-${this.nextId}`, visible: true, locked: true, disableHit: false,
      metadata: { [METADATA_KEYS.localClone]: { sourceItemId: source.id, hasRoute: false } } };
  }
  createId(): string { this.nextId += 1; return `overlay-${this.nextId}`; }
  async getGridDistance(): Promise<number> { return 0; }
  async getGridDpi(): Promise<number> { return 100; }
  async snapGridCenter(position: { x: number; y: number }) { return { ...position }; }
  onGridChange(): () => void { return () => undefined; }
  async send(): Promise<void> { return undefined; }
  on(): () => void { return () => undefined; }
  async show(): Promise<void> { return undefined; }
}

describe("legacy leader ship visibility", () => {
  it("treats a side leader as a viewer of their own side even if old data omitted playerIds", async () => {
    const port = new LegacyLeaderPort();
    const engine = new ProductionEngine(port as unknown as OwlbearPort);

    await engine.visibilityTick("PLAYER", "leader");

    expect(port.localItems.some((item) => item.metadata[METADATA_KEYS.localClone] !== undefined)).toBe(true);
    expect(port.localItems.filter((item) => item.metadata[METADATA_KEYS.navalShipOverlay] !== undefined)).toHaveLength(2);
  });
});
