import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import { resolveEntityFocusFromSelection } from "./entitySelectionAccess";

describe("entity selection access", () => {
  const authorization = {
    armyIds: new Set(["army-1"]),
    shipIds: new Set(["ship-1"]),
    cityIds: new Set(["city-1"])
  };

  it("resolves an authorized local army clone to its source entity", () => {
    expect(resolveEntityFocusFromSelection(
      "clone-army",
      [{
        id: "clone-army",
        metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "army-1" } }
      }],
      [],
      authorization
    )).toEqual({ type: "ARMY", id: "army-1" });
  });

  it("resolves an authorized local ship clone to its source entity", () => {
    expect(resolveEntityFocusFromSelection(
      "clone-ship",
      [{
        id: "clone-ship",
        metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "ship-1" } }
      }],
      [],
      authorization
    )).toEqual({ type: "SHIP", id: "ship-1" });
  });

  it("rejects a local clone for an entity outside the player's authorized snapshot", () => {
    expect(resolveEntityFocusFromSelection(
      "clone-enemy",
      [{
        id: "clone-enemy",
        metadata: { [METADATA_KEYS.localClone]: { sourceItemId: "enemy-army" } }
      }],
      [],
      authorization
    )).toBeUndefined();
  });

  it("resolves authorized scene city markers", () => {
    expect(resolveEntityFocusFromSelection(
      "city-marker",
      [],
      [{
        id: "city-marker",
        metadata: { [METADATA_KEYS.cityMarker]: "city-1" }
      }],
      authorization
    )).toEqual({ type: "CITY", id: "city-1" });
  });
});
