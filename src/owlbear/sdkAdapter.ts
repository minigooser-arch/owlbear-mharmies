import OBR, {
  buildCurve,
  buildImage,
  buildLabel,
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
    NotificationPort {
  addLocalItems(items: readonly SceneItemRecord[]): Promise<void>;
  updateLocalItems(items: readonly SceneItemRecord[]): Promise<void>;
  patchSceneItemMetadata(
    id: string,
    key: string,
    value: unknown | undefined,
    update?: ItemUpdate,
    expectedRevision?: number | null
  ): Promise<void>;
}

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
      getDpi(): Promise<number>;
      snapPosition(
        position: Vector2,
        snappingSensitivity?: number,
        useCorners?: boolean,
        useCenter?: boolean
      ): Promise<Vector2>;
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

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeSdkLocalItem(item: SceneItemRecord): SceneItemRecord {
  if (item.type === "CURVE") {
    const style = objectRecord(item.style);
    return typeof style.strokeColor === "string"
      ? { ...item, strokeColor: style.strokeColor }
      : item;
  }
  if (item.type === "LABEL") {
    const text = objectRecord(item.text);
    const style = objectRecord(text.style);
    return {
      ...item,
      ...(typeof text.plainText === "string" ? { text: text.plainText } : {}),
      ...(typeof style.fillColor === "string" ? { color: style.fillColor } : {})
    };
  }
  return item;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function applyNormalizedLocalItem(
  draft: SceneItemRecord,
  source: SceneItemRecord
): void {
  const commonFields = [
    "name",
    "description",
    "position",
    "rotation",
    "scale",
    "layer",
    "zIndex",
    "visible",
    "locked",
    "disableHit",
    "disableAutoZIndex"
  ] as const;
  const draftRecord = draft as Record<string, unknown>;
  for (const field of commonFields) {
    if (hasOwn(source, field)) draftRecord[field] = structuredClone(source[field]);
  }
  if (hasOwn(source, "metadata")) {
    draft.metadata = {
      ...draft.metadata,
      ...structuredClone(source.metadata)
    };
  }
  if (source.type === "CURVE" && draft.type === "CURVE") {
    if (hasOwn(source, "points")) draft.points = structuredClone(source.points);
    if (hasOwn(source, "strokeColor")) {
      draft.style = {
        ...objectRecord(draft.style),
        strokeColor: source.strokeColor
      };
    }
  }
  if (source.type === "LABEL" && draft.type === "LABEL") {
    const draftText = objectRecord(draft.text);
    const draftTextStyle = objectRecord(draftText.style);
    draft.text = {
      ...draftText,
      ...(typeof source.text === "string" ? { plainText: source.text } : {}),
      style: {
        ...draftTextStyle,
        ...(hasOwn(source, "color") ? { fillColor: source.color } : {})
      }
    };
  }
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

export interface LocalImageBuilderFactory {
  image(image: Image["image"], grid: Image["grid"]): ReturnType<typeof buildImage>;
}

const DEFAULT_IMAGE_BUILDERS: LocalImageBuilderFactory = {
  image: (image, grid) => buildImage(image, grid)
};

export function createSdkImageClone(
  source: SceneItemRecord,
  builders: LocalImageBuilderFactory = DEFAULT_IMAGE_BUILDERS
): SceneItemRecord {
  const image = source as unknown as Image;
  let builder = builders.image(image.image, image.grid)
    .name(source.name ?? "Армия")
    .position(source.position)
    .rotation(source.rotation ?? 0)
    .scale(source.scale ?? { x: 1, y: 1 })
    .layer((source.layer ?? "CHARACTER") as Layer)
    .zIndex(source.zIndex ?? 0)
    .visible(true)
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .metadata(localCloneMetadata(source.id) as Metadata)
    .text(image.text)
    .textItemType(image.textItemType);
  if (typeof source.description === "string") builder = builder.description(source.description);
  return builder.build() as unknown as SceneItemRecord;
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface LocalOverlayBuilderFactory {
  curve(): ReturnType<typeof buildCurve>;
  label(): ReturnType<typeof buildLabel>;
}

const DEFAULT_OVERLAY_BUILDERS: LocalOverlayBuilderFactory = {
  curve: () => buildCurve(),
  label: () => buildLabel()
};

export function createSdkLocalItem(
  source: SceneItemRecord,
  builders: LocalOverlayBuilderFactory = DEFAULT_OVERLAY_BUILDERS
): SceneItemRecord {
  if (source.type === "CURVE" && typeof source.style !== "object") {
    const points = Array.isArray(source.points) ? source.points as Vector2[] : [];
    return builders.curve()
      .id(source.id)
      .name(source.name ?? "Локальная линия")
      .position(source.position)
      .rotation(source.rotation ?? 0)
      .scale(source.scale ?? { x: 1, y: 1 })
      .layer((source.layer ?? "POINTER") as Layer)
      .zIndex(source.zIndex ?? Date.now())
      .visible(source.visible ?? true)
      .locked(source.locked ?? false)
      .disableHit(typeof source.disableHit === "boolean" ? source.disableHit : true)
      .metadata(source.metadata as Metadata)
      .points(points.map((point) => ({ ...point })))
      .fillOpacity(numeric(source.fillOpacity, 0))
      .strokeColor(typeof source.strokeColor === "string" ? source.strokeColor : "#2e7d32")
      .strokeOpacity(numeric(source.strokeOpacity, 1))
      .strokeWidth(numeric(source.strokeWidth, 4))
      .strokeDash(Array.isArray(source.strokeDash) ? source.strokeDash as number[] : [])
      .tension(numeric(source.tension, 0))
      .build() as unknown as SceneItemRecord;
  }
  if (source.type === "LABEL" && typeof source.text === "string") {
    return builders.label()
      .id(source.id)
      .name(source.name ?? "Локальная подпись")
      .position(source.position)
      .rotation(source.rotation ?? 0)
      .scale(source.scale ?? { x: 1, y: 1 })
      .layer((source.layer ?? "POINTER") as Layer)
      .zIndex(source.zIndex ?? Date.now())
      .visible(source.visible ?? true)
      .locked(source.locked ?? false)
      .disableHit(typeof source.disableHit === "boolean" ? source.disableHit : true)
      .metadata(source.metadata as Metadata)
      .plainText(source.text)
      .fillColor(typeof source.color === "string" ? source.color : "#ffffff")
      .fontSize(numeric(source.fontSize, 14))
      .padding(numeric(source.padding, 4))
      .backgroundOpacity(numeric(source.backgroundOpacity, 0.82))
      .cornerRadius(numeric(source.cornerRadius, 6))
      .build() as unknown as SceneItemRecord;
  }
  return source;
}

export function createOwlbearAdapter(
  sdk: OwlbearSdkLike = OBR as unknown as OwlbearSdkLike,
  overlayBuilders: LocalOverlayBuilderFactory = DEFAULT_OVERLAY_BUILDERS
): OwlbearPort {
  const allSceneItems = async () => (await sdk.scene.items.getItems()).map(asRecord);
  const allLocalItems = async () => (await sdk.scene.local.getItems())
    .map(asRecord)
    .map(normalizeSdkLocalItem);

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

  const patchCollectionItemMetadata = async (
    collection: SceneCollectionLike,
    id: string,
    key: string,
    value: unknown | undefined,
    update: ItemUpdate = {},
    expectedRevision?: number | null
  ): Promise<void> => {
    await collection.updateItems([id], (drafts) => {
      const draft = drafts[0];
      if (!draft) throw new Error(`Item not found: ${id}`);
      if (expectedRevision !== undefined) {
        const current = draft.metadata[key];
        const currentRevision = typeof current === "object" && current !== null
          ? typeof (current as Record<string, unknown>).revision === "number"
            ? (current as Record<string, unknown>).revision
            : 0
          : undefined;
        const matches = expectedRevision === null
          ? current === undefined
          : currentRevision === expectedRevision;
        if (!matches) throw new Error(`Metadata revision conflict: ${key}`);
      }
      for (const [field, fieldValue] of Object.entries(update)) {
        if (field !== "metadata") draft[field] = fieldValue;
      }
      if (value === undefined) {
        draft.metadata = Object.fromEntries(
          Object.entries(draft.metadata).filter(([metadataKey]) => metadataKey !== key)
        );
      } else {
        draft.metadata = { ...draft.metadata, [key]: value };
      }
    });
  };

  const addLocalItems = async (items: readonly SceneItemRecord[]): Promise<void> => {
    if (items.length === 0) return;
    await sdk.scene.local.addItems(items.map((item) =>
      createSdkLocalItem(item, overlayBuilders) as unknown as Item
    ));
  };

  const updateLocalItems = async (items: readonly SceneItemRecord[]): Promise<void> => {
    if (items.length === 0) return;
    const updateById = new Map(items.map((item) => [item.id, item]));
    await sdk.scene.local.updateItems(items.map((item) => item.id), (drafts) => {
      for (const draft of drafts) {
        const update = updateById.get(draft.id);
        if (update) applyNormalizedLocalItem(draft, update);
      }
    });
  };

  return {
    getSceneMetadata: () => sdk.scene.getMetadata(),
    patchSceneMetadata: (update) => sdk.scene.setMetadata(update),
    getSceneItems: allSceneItems,
    updateSceneItem: (id, update) => updateCollectionItem(sdk.scene.items, id, update),
    patchSceneItemMetadata: (id, key, value, update, expectedRevision) =>
      patchCollectionItemMetadata(
        sdk.scene.items,
        id,
        key,
        value,
        update,
        expectedRevision
      ),
    getLocalItems: allLocalItems,
    addLocalItem: async (item) => addLocalItems([item]),
    addLocalItems,
    updateLocalItem: (id, update) => updateCollectionItem(sdk.scene.local, id, update),
    updateLocalItems,
    deleteLocalItems: async (ids) => sdk.scene.local.deleteItems([...ids]),
    createClone: createSdkImageClone,
    send: (channel, data) => sdk.broadcast.sendMessage(channel, data, { destination: "ALL" }),
    on: (channel, listener) => sdk.broadcast.onMessage(channel, listener),
    getGridDistance: (from, to) => sdk.scene.grid.getDistance(from, to),
    getGridDpi: () => sdk.scene.grid.getDpi(),
    snapGridCenter: (position) => sdk.scene.grid.snapPosition(position, 1, false, true),
    onGridChange: (callback) => sdk.scene.grid.onChange(callback),
    show: async (message, variant) => {
      await sdk.notification.show(message, variant);
    }
  };
}
