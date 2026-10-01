import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import {
  createEntityInteractionProxy,
  entityInteractionProxyMatchesSource,
  entityInteractionProxySourceId
} from "./entityInteractionProxy";

describe("entity interaction proxy", () => {
  const source = {
    id: "army-1",
    type: "IMAGE",
    position: { x: 100, y: 200 },
    rotation: 15,
    scale: { x: 1.5, y: 2 },
    layer: "CHARACTER",
    zIndex: 42,
    metadata: {
      [METADATA_KEYS.army]: { sideId: "red" },
      image: { width: 40, height: 30 }
    },
    image: { width: 40, height: 30 }
  };

  it("creates an invisible but hit-testable scene proxy", () => {
    const proxy = createEntityInteractionProxy(source, () => "proxy-1", "player-1");
    expect(proxy.id).toBe("proxy-1");
    expect(proxy.createdUserId).toBe("player-1");
    expect(proxy.type).toBe("SHAPE");
    expect(proxy.visible).toBe(true);
    expect(proxy.locked).toBe(true);
    expect(proxy.disableHit).toBe(false);
    expect(proxy.style).toMatchObject({ fillOpacity: 0, strokeOpacity: 0 });
    expect(entityInteractionProxySourceId(proxy)).toBe("army-1");
  });

  it("tracks source position and size", () => {
    const proxy = createEntityInteractionProxy(source, () => "proxy-1");
    expect(proxy.position).toEqual(source.position);
    expect(proxy.rotation).toBe(source.rotation);
    expect(proxy.width).toBe(60);
    expect(proxy.height).toBe(60);
    expect(entityInteractionProxyMatchesSource(proxy, source)).toBe(true);
  });
});
