import { expect, it } from "vitest";
import { normalizeBarrierState } from "./validation";

it("normalizes a barrier with safe defaults and no unknown fields", () => {
  const result = normalizeBarrierState({
    version: 1,
    blocksMovement: false,
    unknown: "discard me"
  });

  expect(result).toEqual({
    ok: true,
    value: {
      version: 1,
      revision: 0,
      blocksMovement: false,
      blocksVision: true,
      visibility: "GM_ONLY",
      color: "#d32f2f"
    }
  });
});
