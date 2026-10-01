import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { createEntityInteractionProxy, entityInteractionProxyMatchesSource, entityInteractionProxySourceId } from "./entityInteractionProxy";

const source = {
  id: "army-1",
  type: "IMAGE",
  position: { x: 100, y: 200 },
  rotation: 15,
  scale: { x: 1.5, y: 2 },
  layer: "CHARACTER",
  zIndex: 42,
  visible: false,
  locked: true,
  disableHit: false,
  metadata: {
    [METADATA_KEYS.army]: { sideId: "red" }
  },
  image: { width: 40, height: 30 }
} as unknown as SceneItemRecord;

describe("entity interaction proxy", () => {
  it("creates a transparent hit-testable scene item linked to the source", () => {
    const proxy = createEntityInteractionProxy(source, () => "proxy-1");
    expect(proxy.id).toBe("proxy-1");
    expect(proxy.type).toBe("SHAPE");
    expect(proxy.visible).toBe(true);
    expect(proxy.locked).toBe(false);
    expect(proxy.disableHit).toBe(false);
    expect(proxy.attachedTo).toBe("army-1");
    expect(proxy.disableAttachmentBehavior).toEqual(["VISIBLE", "SCALE", "ROTATION", "LOCKED"]);
    expect(proxy.style).toMatchObject({ fillOpacity: 0, strokeOpacity: 0 });
    expect(entityInteractionProxySourceId(proxy)).toBe("army-1");
  });

  it("tracks source transform and dimensions", () => {
    const proxy = createEntityInteractionProxy(source, () => "proxy-1");
    expect(proxy.position).toEqual(source.position);
    expect(proxy.rotation).toBe(source.rotation);
    expect(proxy.width).toBe(60);
    expect(proxy.height).toBe(60);
    expect(entityInteractionProxyMatchesSource(proxy, source)).toBe(true);
  });
});
