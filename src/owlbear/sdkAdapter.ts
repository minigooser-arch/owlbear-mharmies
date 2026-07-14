import OBR, {
  buildImage,
  type Image,
  type Item,
  type Layer,
  type Metadata
} from "@owlbear-rodeo/sdk";
import type { BroadcastEvent, BroadcastPort } from "../commands/commandGateway";
import type { GridSdkPort } from "../grid/gridDistance";
import { METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord, Vector2 } from "../shared/types";
import type { MetadataPort } from "../storage/metadataRepository";
import type { LocalClonePort } from "../visibility/localCloneReconciler";
import type { NotificationPort } from "./notifications";

export interface OwlbearPort
  extends MetadataPort,
    LocalClonePort,
    BroadcastPort,
    GridSdkPort,
    NotificationPort {}

interface SceneCollectionLike {
  getItems(): Promise<unknown[]>;
  updateItems(items: unknown[], update: (drafts: SceneItemRecord[]) => void): Promise<void>;
  addItems(items: unknown[]): Promise<void>;
  deleteItems(ids: string[]): Promise<void>;
}

interface OwlbearSdkLike {
  scene: {
    getMetadata(): Promise<Record<string, unknown>>;
    setMetadata(update: Record<string, unknown>): Promise<void>;
    items: SceneCollectionLike;
    local: SceneCollectionLike;
    grid: {
      getDistance(from: Vector2, to: Vector2): Promise<number>;
      onChange(callback: () => void): () => void;
    };
  };
  broadcast: {
    sendMessage(channel: string, data: unknown, options: { destination: "ALL" }): Promise<void>;
    onMessage(channel: string, callback: (event: BroadcastEvent) => void): () => void;
  };
  notification: {
    show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<unknown>;
  };
}

function asRecord(item: unknown): SceneItemRecord {
  return item as SceneItemRecord;
}

function localCloneMetadata(sourceItemId: string): Record<string, unknown> {
  return { [METADATA_KEYS.localClone]: { sourceItemId } };
}

export function createLocalImageClone(
  source: SceneItemRecord,
  createId: () => string = () => crypto.randomUUID()
): SceneItemRecord {
  const clone: SceneItemRecord = {
    ...structuredClone(source),
    id: createId(),
    visible: true,
    metadata: localCloneMetadata(source.id)
  };
  return clone;
}

function createSdkImageClone(source: SceneItemRecord): SceneItemRecord {
  const image = source as unknown as Image;
  let builder = buildImage(image.image, image.grid)
    .name(source.name ?? "Армия")
    .position(source.position)
    .rotation(source.rotation ?? 0)
    .scale(source.scale ?? { x: 1, y: 1 })
    .layer((source.layer ?? "CHARACTER") as Layer)
    .zIndex(source.zIndex ?? 0)
    .visible(true)
    .metadata(localCloneMetadata(source.id) as Metadata)
    .text(image.text);
  if (typeof source.description === "string") builder = builder.description(source.description);
  return builder.build() as unknown as SceneItemRecord;
}

export function createOwlbearAdapter(
  sdk: OwlbearSdkLike = OBR as unknown as OwlbearSdkLike
): OwlbearPort {
  const allSceneItems = async () => (await sdk.scene.items.getItems()).map(asRecord);
  const allLocalItems = async () => (await sdk.scene.local.getItems()).map(asRecord);

  const updateCollectionItem = async (
    collection: SceneCollectionLike,
    id: string,
    update: ItemUpdate
  ): Promise<void> => {
    const item = (await collection.getItems()).map(asRecord).find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Item not found: ${id}`);
    await collection.updateItems([item], (drafts) => {
      const draft = drafts[0];
      if (draft) Object.assign(draft, update);
    });
  };

  return {
    getSceneMetadata: () => sdk.scene.getMetadata(),
    patchSceneMetadata: (update) => sdk.scene.setMetadata(update),
    getSceneItems: allSceneItems,
    updateSceneItem: (id, update) => updateCollectionItem(sdk.scene.items, id, update),
    getLocalItems: allLocalItems,
    addLocalItem: async (item) => sdk.scene.local.addItems([item as unknown as Item]),
    updateLocalItem: (id, update) => updateCollectionItem(sdk.scene.local, id, update),
    deleteLocalItems: async (ids) => sdk.scene.local.deleteItems([...ids]),
    createClone: createSdkImageClone,
    send: (channel, data) => sdk.broadcast.sendMessage(channel, data, { destination: "ALL" }),
    on: (channel, listener) => sdk.broadcast.onMessage(channel, listener),
    getGridDistance: (from, to) => sdk.scene.grid.getDistance(from, to),
    onGridChange: (callback) => sdk.scene.grid.onChange(callback),
    show: async (message, variant) => {
      await sdk.notification.show(message, variant);
    }
  };
}
