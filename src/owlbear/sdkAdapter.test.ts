// @vitest-environment jsdom

import { expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { createLocalImageClone } from "./sdkAdapter";

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
