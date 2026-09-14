import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import { buildPeaceTransferOverlays, peaceTransferOverlayKey } from "./peaceTransferOverlayService";

describe("peace transfer overlay", () => {
  it("renders one local highlighted square per selected cell", () => {
    const overlays = buildPeaceTransferOverlays(
      [{ x: 1, y: 2 }, { x: -1, y: 0 }],
      "#55aa55",
      100
    );
    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.item.type).toBe("CURVE");
    expect(overlays[0]?.item.fillOpacity).toBeGreaterThan(0);
  });

  it("recognizes only its own local preview items", () => {
    expect(peaceTransferOverlayKey({
      id: "preview",
      type: "CURVE",
      position: { x: 0, y: 0 },
      metadata: { [METADATA_KEYS.peaceTransferOverlay]: { cellKey: "1,2" } }
    })).toBe("1,2");
  });
});
