// @vitest-environment jsdom
import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { createSdkLocalItem } from "./sdkAdapter";

function fluentBuilder() {
  const values: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  const methods = [
    "id", "name", "position", "rotation", "scale", "layer", "zIndex", "visible", "locked", "disableHit",
    "metadata", "points", "fillColor", "fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth", "strokeDash", "tension"
  ];
  for (const method of methods) {
    builder[method] = (value: unknown) => {
      values[method] = value;
      return builder;
    };
  }
  builder.build = () => ({ id: values.id, type: "CURVE", style: { fillColor: values.fillColor, fillOpacity: values.fillOpacity, strokeColor: values.strokeColor } });
  return builder;
}

it("passes a curve fill color to the Owlbear builder", () => {
  const builder = fluentBuilder();
  const source: SceneItemRecord = {
    id: "terrain",
    type: "CURVE",
    position: { x: 0, y: 0 },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }],
    fillColor: "#43a047",
    fillOpacity: 0.24,
    strokeColor: "#43a047",
    metadata: {}
  };

  const built = createSdkLocalItem(source, {
    curve: () => builder,
    label: () => { throw new Error("label builder not expected"); }
  } as never) as unknown as { style?: { fillColor?: string; fillOpacity?: number } };

  expect(built.style).toMatchObject({ fillColor: "#43a047", fillOpacity: 0.24 });
});
