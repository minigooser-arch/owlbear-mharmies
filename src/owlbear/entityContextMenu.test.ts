import { describe, expect, it } from "vitest";
import type { Item } from "@owlbear-rodeo/sdk";
import { METADATA_KEYS } from "../shared/constants";
import { entityFocusFromItem, readEntityFocusFromPlayerMetadata, registerEntityContextMenu } from "./entityContextMenu";

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


describe("entity context menu registration", () => {
  it("accepts visible local clones and resolves their source token", async () => {
    type Entry = Parameters<Parameters<typeof registerEntityContextMenu>[0]["create"]>[0];
    const entries: Entry[] = [];
    const focused: unknown[] = [];
    const port = {
      create: async (entry: Entry) => { entries.push(entry); },
      remove: async () => undefined,
      getSceneItem: async () => ({
        id: "army-source",
        metadata: { [METADATA_KEYS.army]: { sideId: "red" } }
      }),
      setPlayerMetadata: async (update: Record<string, unknown>) => {
        focused.push(update);
      },
      openAction: async () => undefined,
      show: async () => undefined
    };

    await registerEntityContextMenu(port, "/icon.png");
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    const cloneIcon = entry.icons[0];
    expect(cloneIcon.label).toBe("Открыть объект");
    expect(cloneIcon.filter.every).toContainEqual({
      key: ["metadata", METADATA_KEYS.localClone, "sourceItemId"],
      operator: "!=",
      value: undefined
    });

    await entry.onClick({
      items: [{
        id: "clone-army",
        type: "IMAGE",
        name: "Army clone",
        visible: true,
        locked: true,
        disableHit: false,
        disableAutoZIndex: false,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        metadata: {
          [METADATA_KEYS.localClone]: { sourceItemId: "army-source" }
        }
      } as Item]
    });

    expect(focused).toEqual([{
      "com.letopis.army-control/entity-focus": { type: "ARMY", id: "army-source" }
    }]);
  });
});
