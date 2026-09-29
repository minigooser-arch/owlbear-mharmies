import { describe, expect, it } from "vitest";
import { armyTokenPickerOptions } from "./armyTokenPicker";

describe("army token picker", () => {
  it("opens the asset manager without a faction-name or asset-type filter", () => {
    expect(armyTokenPickerOptions()).toEqual({
      multiple: false,
      defaultSearch: undefined,
      typeHint: undefined
    });
  });
});
