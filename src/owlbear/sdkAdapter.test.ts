// @vitest-environment jsdom

import { expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import {
  createLocalImageClone,
  createOwlbearAdapter,
  createSdkImageClone,
  createSdkLocalItem,
  type LocalImageBuilderFactory,
  type LocalOverlayBuilderFactory
} from "./sdkAdapter";

function fakeBuilder(type: "CURVE" | "LABEL"): unknown {
  const values: Record<string, unknown> = {};
  const proxy = new Proxy<Record<string, unknown>>({}, {
    get: (_target, property) => {
      if (property === "build") {
        return () => type === "CURVE"
          ? {
              ...values,
              type,
              style: {
                fillOpacity: values.fillOpacity,
                strokeColor: values.strokeColor,
                strokeOpacity: values.strokeOpacity,
                strokeWidth: values.strokeWidth,
                strokeDash: values.strokeDash,
                tension: values.tension
              }
            }
          : {
              ...values,
              type,
              text: {
                plainText: values.plainText,
                style: { fillColor: values.fillColor }
              },
              style: {
                backgroundOpacity: values.backgroundOpacity,
                cornerRadius: values.cornerRadius
              }
            };
      }
      return (value: unknown) => {
        values[String(property)] = value;
        return proxy;
      };
    }
  });
  return proxy;
}

function fakeOverlayBuilders(): LocalOverlayBuilderFactory {
  return {
    curve: () => fakeBuilder("CURVE") as ReturnType<LocalOverlayBuilderFactory["curve"]>,
    label: () => fakeBuilder("LABEL") as ReturnType<LocalOverlayBuilderFactory["label"]>
  };
}

function fakeImageBuilders(): LocalImageBuilderFactory {
  const values: Record<string, unknown> = {};
  const proxy = new Proxy<Record<string, unknown>>({}, {
    get: (_target, property) => {
      if (property === "build") return () => ({ ...values, type: "IMAGE" });
      return (value: unknown) => {
        values[String(property)] = value;
        return proxy;
      };
    }
  });
  return {
    image: () => proxy as unknown as ReturnType<LocalImageBuilderFactory["image"]>
  };
}

it("copies image render fields and adds source metadata to a new local ID", () => {
  const source: SceneItemRecord = {
    id: "source",
    type: "IMAGE",
    name: "Армия",
    description: "Описание",
    position: { x: 4, y: 8 },
    rotation: 30,
    scale: { x: 2, y: 3 },
    layer: "CHARACTER",
    zIndex: 7,
    metadata: { "source/data": true },
    image: { url: "image", mime: "image/png", width: 100, height: 100 },
    grid: { dpi: 100, offset: { x: 0, y: 0 } },
    text: { plainText: "A" }
  };
  const clone = createLocalImageClone(source, () => "new-id");
  expect(clone).toMatchObject({
    id: "new-id",
    name: "Армия",
    description: "Описание",
    position: { x: 4, y: 8 },
    rotation: 30,
    scale: { x: 2, y: 3 },
    layer: "CHARACTER",
    zIndex: 7,
    visible: true,
    metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "source" } }
  });
});

it("builds local image clones as non-interactive and preserves text semantics", () => {
  const clone = createSdkImageClone({
    id: "source",
    type: "IMAGE",
    position: { x: 4, y: 8 },
    locked: false,
    disableHit: false,
    metadata: {},
    image: { url: "image", mime: "image/png", width: 100, height: 100 },
    grid: { dpi: 100, offset: { x: 0, y: 0 } },
    text: { plainText: "A" },
    textItemType: "TEXT"
  }, fakeImageBuilders());

  expect(clone).toMatchObject({
    type: "IMAGE",
    locked: true,
    disableHit: true,
    textItemType: "TEXT",
    metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "source" } }
  });
});

it("patches one scene-item metadata key without overwriting unrelated metadata", async () => {
  let item: SceneItemRecord = {
    id: "army",
    type: "IMAGE",
    position: { x: 0, y: 0 },
    metadata: { other: { keep: true }, [METADATA_KEYS.army]: { revision: 1 } }
  };
  const collection = {
    getItems: async () => [structuredClone(item)],
    updateItems: async (_filter: unknown[], update: (drafts: SceneItemRecord[]) => void) => {
      const drafts = [structuredClone(item)];
      update(drafts);
      item = drafts[0] as SceneItemRecord;
    },
    addItems: async () => undefined,
    deleteItems: async () => undefined
  };
  const adapter = createOwlbearAdapter({
    scene: {
      getMetadata: async () => ({}),
      setMetadata: async () => undefined,
      items: collection,
      local: collection,
      grid: {
        getDistance: async () => 0,
        snapPosition: async (position) => position,
        onChange: () => () => undefined
      }
    },
    broadcast: {
      sendMessage: async () => undefined,
      onMessage: () => () => undefined
    },
    notification: { show: async () => undefined }
  });

  const patchMetadata = (adapter as typeof adapter & {
    patchSceneItemMetadata(
      id: string,
      key: string,
      value: unknown,
      update?: Record<string, unknown>,
      expectedRevision?: number | null
    ): Promise<void>;
  }).patchSceneItemMetadata.bind(adapter);
  await patchMetadata(
    "army",
    METADATA_KEYS.army,
    { revision: 2 },
    { visible: false },
    1
  );

  expect(item).toMatchObject({
    visible: false,
    metadata: {
      other: { keep: true },
      [METADATA_KEYS.army]: { revision: 2 }
    }
  });

  await expect(patchMetadata(
    "army",
    METADATA_KEYS.army,
    { revision: 3 },
    { visible: true },
    1
  )).rejects.toThrow("Metadata revision conflict");
  expect(item).toMatchObject({
    visible: false,
    metadata: { [METADATA_KEYS.army]: { revision: 2 } }
  });
});

it("builds valid Owlbear curve and label items for local overlays", () => {
  const builders = fakeOverlayBuilders();
  const curve = createSdkLocalItem({
    id: "route-line",
    type: "CURVE",
    position: { x: 0, y: 0 },
    visible: true,
    disableHit: true,
    points: [{ x: 0, y: 0 }, { x: 2, y: 1 }],
    strokeColor: "#f00",
    metadata: { [METADATA_KEYS.routePreview]: { kind: "LINE" } }
  }, builders);
  const label = createSdkLocalItem({
    id: "route-label",
    type: "LABEL",
    position: { x: 2, y: 1 },
    visible: true,
    disableHit: true,
    text: "Осталось: 3",
    color: "#0f0",
    metadata: { [METADATA_KEYS.routePreview]: { kind: "DISTANCE" } }
  }, builders);

  expect(curve).toMatchObject({
    id: "route-line",
    type: "CURVE",
    layer: "POINTER",
    disableHit: true,
    points: [{ x: 0, y: 0 }, { x: 2, y: 1 }],
    style: { fillOpacity: 0, strokeColor: "#f00" }
  });
  expect(label).toMatchObject({
    id: "route-label",
    type: "LABEL",
    layer: "POINTER",
    disableHit: true,
    text: { plainText: "Осталось: 3", style: { fillColor: "#0f0" } }
  });
});

it("snaps grid positions to cell centres with full sensitivity", async () => {
  const calls: unknown[][] = [];
  const collection = {
    getItems: async () => [],
    updateItems: async () => undefined,
    addItems: async () => undefined,
    deleteItems: async () => undefined
  };
  const adapter = createOwlbearAdapter({
    scene: {
      getMetadata: async () => ({}),
      setMetadata: async () => undefined,
      items: collection,
      local: collection,
      grid: {
        getDistance: async () => 0,
        snapPosition: async (...args: unknown[]) => {
          calls.push(args);
          return { x: 50, y: 150 };
        },
        onChange: () => () => undefined
      }
    },
    broadcast: {
      sendMessage: async () => undefined,
      onMessage: () => () => undefined
    },
    notification: { show: async () => undefined }
  });

  await expect(adapter.snapGridCenter({ x: 17, y: 129 })).resolves.toEqual({ x: 50, y: 150 });
  expect(calls).toEqual([[{ x: 17, y: 129 }, 1, false, true]]);
});

it("adds normalized local overlays in one SDK collection batch", async () => {
  const addedBatches: unknown[][] = [];
  const collection = {
    getItems: async () => [],
    updateItems: async () => undefined,
    addItems: async (items: unknown[]) => { addedBatches.push(structuredClone(items)); },
    deleteItems: async () => undefined
  };
  const adapter = createOwlbearAdapter({
    scene: {
      getMetadata: async () => ({}),
      setMetadata: async () => undefined,
      items: collection,
      local: collection,
      grid: {
        getDistance: async () => 0,
        snapPosition: async (position) => position,
        onChange: () => () => undefined
      }
    },
    broadcast: { sendMessage: async () => undefined, onMessage: () => () => undefined },
    notification: { show: async () => undefined }
  }, fakeOverlayBuilders());

  await adapter.addLocalItems([
    {
      id: "curve",
      type: "CURVE",
      position: { x: 0, y: 0 },
      points: [{ x: 0, y: 0 }, { x: 2, y: 1 }],
      strokeColor: "#f00",
      metadata: {}
    },
    {
      id: "label",
      type: "LABEL",
      position: { x: 2, y: 1 },
      text: "2",
      color: "#0f0",
      metadata: {}
    }
  ]);

  expect(addedBatches).toHaveLength(1);
  expect(addedBatches[0]).toMatchObject([
    { id: "curve", points: [{ x: 0, y: 0 }, { x: 2, y: 1 }], style: { strokeColor: "#f00" } },
    { id: "label", text: { plainText: "2", style: { fillColor: "#0f0" } } }
  ]);
});

it("updates normalized overlays in one batch using nested SDK fields", async () => {
  let locals: SceneItemRecord[] = [
    {
      id: "curve",
      type: "CURVE",
      position: { x: 0, y: 0 },
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      style: { strokeColor: "#111", strokeWidth: 7 },
      metadata: { other: { keep: true } },
      custom: "curve-value"
    },
    {
      id: "label",
      type: "LABEL",
      position: { x: 1, y: 0 },
      text: { plainText: "1", style: { fillColor: "#111", fontSize: 22 }, richText: "keep" },
      metadata: { other: { keep: true } },
      custom: "label-value"
    }
  ];
  let updateCalls = 0;
  const localCollection = {
    getItems: async () => structuredClone(locals),
    updateItems: async (ids: unknown[], update: (drafts: SceneItemRecord[]) => void) => {
      updateCalls += 1;
      const selected = locals.filter((item) => ids.includes(item.id)).map((item) => structuredClone(item));
      update(selected);
      locals = locals.map((item) => selected.find((draft) => draft.id === item.id) ?? item);
    },
    addItems: async () => undefined,
    deleteItems: async () => undefined
  };
  const sceneCollection = { ...localCollection, getItems: async () => [] };
  const adapter = createOwlbearAdapter({
    scene: {
      getMetadata: async () => ({}),
      setMetadata: async () => undefined,
      items: sceneCollection,
      local: localCollection,
      grid: {
        getDistance: async () => 0,
        snapPosition: async (position) => position,
        onChange: () => () => undefined
      }
    },
    broadcast: { sendMessage: async () => undefined, onMessage: () => () => undefined },
    notification: { show: async () => undefined }
  });

  await adapter.updateLocalItems([
    {
      id: "curve",
      type: "CURVE",
      position: { x: 0, y: 0 },
      points: [{ x: 0, y: 0 }, { x: 3, y: 2 }],
      strokeColor: "#f00",
      metadata: { "test/overlay": { key: "line" } }
    },
    {
      id: "label",
      type: "LABEL",
      position: { x: 3, y: 2 },
      text: "Осталось: 2",
      color: "#0f0",
      metadata: { "test/overlay": { key: "distance" } }
    }
  ]);

  expect(updateCalls).toBe(1);
  expect(locals).toMatchObject([
    {
      id: "curve",
      type: "CURVE",
      points: [{ x: 0, y: 0 }, { x: 3, y: 2 }],
      style: { strokeColor: "#f00", strokeWidth: 7 },
      metadata: { other: { keep: true }, "test/overlay": { key: "line" } },
      custom: "curve-value"
    },
    {
      id: "label",
      type: "LABEL",
      position: { x: 3, y: 2 },
      text: {
        plainText: "Осталось: 2",
        style: { fillColor: "#0f0", fontSize: 22 },
        richText: "keep"
      },
      metadata: { other: { keep: true }, "test/overlay": { key: "distance" } },
      custom: "label-value"
    }
  ]);
});

it("normalizes nested SDK curve and label fields when reading local overlays", async () => {
  const locals: SceneItemRecord[] = [
    {
      id: "curve",
      type: "CURVE",
      position: { x: 0, y: 0 },
      points: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
      style: { strokeColor: "#f00", strokeWidth: 4 },
      metadata: {}
    },
    {
      id: "label",
      type: "LABEL",
      position: { x: 2, y: 0 },
      text: { plainText: "2", style: { fillColor: "#0f0", fontSize: 16 } },
      metadata: {}
    }
  ];
  const localCollection = {
    getItems: async () => structuredClone(locals),
    updateItems: async () => undefined,
    addItems: async () => undefined,
    deleteItems: async () => undefined
  };
  const adapter = createOwlbearAdapter({
    scene: {
      getMetadata: async () => ({}),
      setMetadata: async () => undefined,
      items: { ...localCollection, getItems: async () => [] },
      local: localCollection,
      grid: {
        getDistance: async () => 0,
        snapPosition: async (position) => position,
        onChange: () => () => undefined
      }
    },
    broadcast: { sendMessage: async () => undefined, onMessage: () => () => undefined },
    notification: { show: async () => undefined }
  });

  await expect(adapter.getLocalItems()).resolves.toMatchObject([
    { id: "curve", strokeColor: "#f00", style: { strokeWidth: 4 } },
    { id: "label", text: "2", color: "#0f0" }
  ]);
});
