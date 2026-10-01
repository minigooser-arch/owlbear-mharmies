import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID, METADATA_KEYS } from "../shared/constants";
import type { MapEntityFocus } from "./entityFocus";
import { parseMapEntityFocus } from "./entityFocus";

export interface EntityContextMenuPort {
  create(entry: Parameters<typeof OBR.contextMenu.create>[0]): Promise<void> | void;
  remove(id: string): Promise<void> | void;
  setPlayerMetadata(update: Record<string, unknown>): Promise<void>;
  openAction(): Promise<void>;
  show(message: string, variant: "ERROR" | "WARNING" | "SUCCESS"): Promise<void>;
}

export const ENTITY_CONTEXT_MENU_ID = `${EXTENSION_ID}/entity-access`;
export const ENTITY_FOCUS_METADATA_KEY = `${EXTENSION_ID}/entity-focus`;

export function entityFocusFromItem(item: Pick<Item, "id" | "metadata">): MapEntityFocus | undefined {
  if (item.metadata[METADATA_KEYS.army] !== undefined) {
    return { type: "ARMY", id: item.id };
  }
  if (item.metadata[METADATA_KEYS.ship] !== undefined) {
    return { type: "SHIP", id: item.id };
  }
  const cityId = item.metadata[METADATA_KEYS.cityMarker];
  if (typeof cityId === "string" && cityId.length > 0) {
    return { type: "CITY", id: cityId };
  }
  return undefined;
}

export function registerEntityContextMenu(
  port: EntityContextMenuPort,
  iconUrl: string
): Promise<() => Promise<void>> {
  return Promise.resolve(port.create({
    id: ENTITY_CONTEXT_MENU_ID,
    icons: [{
      icon: iconUrl,
      label: "Открыть в военной панели",
      filter: {
        min: 1,
        max: 1,
        every: [
          { key: ["metadata", METADATA_KEYS.localClone], value: undefined }
        ],
        some: [
          { key: ["metadata", METADATA_KEYS.army], operator: "!=", value: undefined },
          { key: ["metadata", METADATA_KEYS.ship], operator: "!=", value: undefined },
          { key: ["metadata", METADATA_KEYS.cityMarker], operator: "!=", value: undefined }
        ]
      }
    }],
    onClick: async (context) => {
      const item = context.items[0];
      if (!item) return;
      const focus = entityFocusFromItem(item);
      if (!focus) {
        await port.show("Объект больше не зарегистрирован в военной системе.", "WARNING");
        return;
      }
      await port.setPlayerMetadata({ [ENTITY_FOCUS_METADATA_KEY]: focus });
      await port.openAction();
    }
  })).then(() => async () => {
    await port.remove(ENTITY_CONTEXT_MENU_ID);
  });
}

export function readEntityFocusFromPlayerMetadata(metadata: Record<string, unknown>): MapEntityFocus | undefined {
  return parseMapEntityFocus(metadata[ENTITY_FOCUS_METADATA_KEY]);
}
