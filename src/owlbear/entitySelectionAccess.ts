import type { Item } from "@owlbear-rodeo/sdk";
import { METADATA_KEYS } from "../shared/constants";
import type { MapEntityFocus } from "./entityFocus";
import { entityFocusFromItem } from "./entityContextMenu";

function localCloneSourceItemId(item: Pick<Item, "metadata">): string | undefined {
  const localClone = item.metadata[METADATA_KEYS.localClone];
  if (typeof localClone !== "object" || localClone === null || Array.isArray(localClone)) return undefined;
  const sourceItemId = (localClone as Record<string, unknown>).sourceItemId;
  return typeof sourceItemId === "string" && sourceItemId.length > 0 ? sourceItemId : undefined;
}

export interface EntitySelectionAuthorization {
  armyIds: ReadonlySet<string>;
  shipIds: ReadonlySet<string>;
  cityIds: ReadonlySet<string>;
}

export function resolveEntityFocusFromSelection(
  selectedItemId: string,
  localItems: readonly Pick<Item, "id" | "metadata">[],
  sceneItems: readonly Pick<Item, "id" | "metadata">[],
  authorization: EntitySelectionAuthorization
): MapEntityFocus | undefined {
  const localItem = localItems.find((item) => item.id === selectedItemId);
  if (localItem) {
    const sourceItemId = localCloneSourceItemId(localItem);
    if (!sourceItemId) return undefined;
    if (authorization.armyIds.has(sourceItemId)) return { type: "ARMY", id: sourceItemId };
    if (authorization.shipIds.has(sourceItemId)) return { type: "SHIP", id: sourceItemId };
    return undefined;
  }

  const sceneItem = sceneItems.find((item) => item.id === selectedItemId);
  if (!sceneItem) return undefined;
  const focus = entityFocusFromItem(sceneItem);
  if (!focus) return undefined;
  if (focus.type === "ARMY" && authorization.armyIds.has(focus.id)) return focus;
  if (focus.type === "SHIP" && authorization.shipIds.has(focus.id)) return focus;
  if (focus.type === "CITY" && authorization.cityIds.has(focus.id)) return focus;
  return undefined;
}
