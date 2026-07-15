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
      grid: { getDistance: async () => 0, onChange: () => () => undefined }
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
