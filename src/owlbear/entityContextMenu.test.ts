import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import { entityFocusFromItem, readEntityFocusFromPlayerMetadata } from "./entityContextMenu";

describe("entity context menu", () => {
  it("resolves army and ship tokens by their authoritative metadata", () => {
    expect(entityFocusFromItem({
      id: "army-1",
      metadata: { [METADATA_KEYS.army]: { sideId: "red" } }
    })).toEqual({ type: "ARMY", id: "army-1" });

    expect(entityFocusFromItem({
      id: "ship-1",
      metadata: { [METADATA_KEYS.ship]: { sideId: "blue" } }
    })).toEqual({ type: "SHIP", id: "ship-1" });
  });

  it("resolves city markers through the marker metadata", () => {
    expect(entityFocusFromItem({
      id: "city-token",
      metadata: { [METADATA_KEYS.cityMarker]: "city-1" }
    })).toEqual({ type: "CITY", id: "city-1" });
  });

  it("rejects ordinary tokens and malformed player focus", () => {
    expect(entityFocusFromItem({ id: "ordinary", metadata: {} })).toBeUndefined();
    expect(readEntityFocusFromPlayerMetadata({
      "com.letopis.army-control/entity-focus": { type: "PLANE", id: "x" }
    })).toBeUndefined();
  });
});
