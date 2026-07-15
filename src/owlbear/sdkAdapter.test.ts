// @vitest-environment jsdom

import { expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import {
  createLocalImageClone,
  createSdkLocalItem,
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
