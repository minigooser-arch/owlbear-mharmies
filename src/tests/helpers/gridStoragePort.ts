import { METADATA_KEYS } from "../../shared/constants";
import type { SceneItemRecord } from "../../shared/types";
import type { MetadataPort } from "../../storage/metadataRepository";

export class GridStoragePort implements MetadataPort {
  metadata: Record<string, unknown> = {};
  items: SceneItemRecord[] = [];
  requests: unknown[] = [];
  failAdd = false;
  failCommit = false;
  failDelete = false;
  beforeItems: (() => void) | undefined;
  afterItemsRead: (() => void) | undefined;
  afterAdd: (() => void) | undefined;
  async getSceneMetadata() { return structuredClone(this.metadata); }
  async getSceneItems() {
    this.beforeItems?.(); this.beforeItems = undefined;
    const items = structuredClone(this.items);
    this.afterItemsRead?.(); this.afterItemsRead = undefined;
    return items;
  }
  async updateSceneItem(id: string, update: Partial<SceneItemRecord>) {
    const item = this.items.find(item => item.id === id);
    if (!item) throw new Error("missing item");
    Object.assign(item, structuredClone(update));
  }
  async patchSceneMetadata(update: Record<string, unknown>) {
    if (this.failCommit) { this.failCommit = false; throw new Error("commit failed"); }
    this.requests.push(structuredClone(update));
    this.metadata = { ...this.metadata, ...structuredClone(update) };
  }
  async addSceneItems(items: readonly SceneItemRecord[]) {
    if (this.failAdd) throw new Error("add failed");
    this.requests.push(structuredClone(items));
    this.items.push(...structuredClone(items));
    this.afterAdd?.(); this.afterAdd = undefined;
  }
  async deleteSceneItems(ids: readonly string[]) {
    if (this.failDelete) throw new Error("cleanup failed");
    this.items = this.items.filter(item => !ids.includes(item.id));
  }
  manifest() { return this.metadata[METADATA_KEYS.gridManifest] as { version: number; revision: number; chunks: Record<string, string> }; }
}
