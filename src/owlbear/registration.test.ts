import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { resolveRegistrationSelection } from "./registration";

function image(id: string): SceneItemRecord {
  return { id, type: "IMAGE", position: { x: 0, y: 0 }, metadata: {} };
}

function shape(id: string): SceneItemRecord {
  return { id, type: "SHAPE", position: { x: 0, y: 0 }, metadata: {} };
}

function registeredImage(id: string): SceneItemRecord {
  return {
    ...image(id),
    metadata: { [METADATA_KEYS.army]: { registered: true } }
  };
}

describe("registration selection", () => {
  it.each([
    [[], "SELECTION_EMPTY"],
    [["a", "b"], "SELECTION_MULTIPLE"],
    [["shape"], "IMAGE_REQUIRED"],
    [["army"], "ALREADY_REGISTERED"]
  ])("rejects invalid registration selection %j", (selection, code) => {
    expect(() => resolveRegistrationSelection({
      selection,
      items: [image("a"), image("b"), shape("shape"), registeredImage("army")]
    })).toThrowError(expect.objectContaining({ code }));
  });

  it("rejects a selected item that is no longer on the scene", () => {
    expect(() => resolveRegistrationSelection({ selection: ["missing"], items: [] }))
      .toThrowError(expect.objectContaining({ code: "ITEM_NOT_FOUND" }));
  });

  it("returns the one selected unregistered image", () => {
    const selected = image("selected");
    expect(resolveRegistrationSelection({
      selection: [selected.id],
      items: [image("other"), selected]
    })).toBe(selected);
  });
});
