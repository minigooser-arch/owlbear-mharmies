import { EXTENSION_ID, METADATA_KEYS } from "../shared/constants";

export const NAVAL_INTERCEPTION_CONTEXT_MENU_ID = `${EXTENSION_ID}/naval-interception`;

export interface NavalInterceptionContextMenuItem {
  id: string;
}

export interface NavalInterceptionContextMenuContext {
  items: readonly NavalInterceptionContextMenuItem[];
}

export interface NavalInterceptionContextMenuFilterCondition {
  key: string | string[];
  value: unknown;
  operator?: "!=";
}

export interface NavalInterceptionContextMenuEntry {
  id: string;
  icons: Array<{
    icon: string;
    label: string;
    filter: {
      min: number;
      max: number;
      every: NavalInterceptionContextMenuFilterCondition[];
    };
  }>;
  onClick(context: NavalInterceptionContextMenuContext): void | Promise<void>;
}

export interface NavalInterceptionContextMenuPort {
  create(entry: NavalInterceptionContextMenuEntry): Promise<unknown>;
  remove(id: string): Promise<unknown>;
}

export interface NavalInterceptionActionService {
  activateInterception(shipId: string): Promise<void>;
}

export async function registerNavalInterceptionContextMenu(
  port: NavalInterceptionContextMenuPort,
  service: NavalInterceptionActionService,
  iconUrl: string
): Promise<() => Promise<void>> {
  await port.create({
    id: NAVAL_INTERCEPTION_CONTEXT_MENU_ID,
    icons: [{
      icon: iconUrl,
      label: "Перехват",
      filter: {
        min: 1,
        max: 1,
        every: [
          {
            key: ["metadata", METADATA_KEYS.ship],
            operator: "!=",
            value: undefined
          },
          {
            key: ["metadata", METADATA_KEYS.ship, "classId"],
            value: "CRUISER"
          }
        ]
      }
    }],
    onClick: async (context) => {
      const shipId = context.items[0]?.id;
      if (!shipId) return;
      await service.activateInterception(shipId);
    }
  });

  return async () => {
    await port.remove(NAVAL_INTERCEPTION_CONTEXT_MENU_ID);
  };
}
