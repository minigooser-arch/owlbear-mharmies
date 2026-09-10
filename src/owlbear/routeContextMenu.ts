import { EXTENSION_ID, METADATA_KEYS } from "../shared/constants";

export const ROUTE_SET_CONTEXT_MENU_ID = `${EXTENSION_ID}/set-route-from-token`;
/** Legacy ID retained for compatibility with imports; route UI now uses one persistent menu item. */
export const ROUTE_EDIT_CONTEXT_MENU_ID = `${EXTENSION_ID}/edit-route-from-token`;

export interface RouteContextMenuItem {
  id: string;
}

export interface RouteContextMenuContext {
  items: readonly RouteContextMenuItem[];
}

export interface RouteContextMenuFilterCondition {
  key: string | string[];
  value: unknown;
  operator?: "!=";
}

export interface RouteContextMenuEntry {
  id: string;
  icons: Array<{
    icon: string;
    label: string;
    filter: {
      min: number;
      max: number;
      every: RouteContextMenuFilterCondition[];
    };
  }>;
  onClick(context: RouteContextMenuContext): void | Promise<void>;
}

export interface RouteContextMenuPort {
  create(entry: RouteContextMenuEntry): Promise<unknown>;
  remove(id: string): Promise<unknown>;
}

export interface RouteContextMenuActionService {
  openRouteForLocalItem(itemId: string): Promise<void>;
}

function routeIcon(
  label: string,
  hasRoute: boolean,
  iconUrl: string
): RouteContextMenuEntry["icons"][number] {
  return {
    icon: iconUrl,
    label,
    filter: {
      min: 1,
      max: 1,
      every: [
        {
          key: ["metadata", METADATA_KEYS.localClone],
          operator: "!=",
          value: undefined
        },
        {
          key: ["metadata", METADATA_KEYS.localClone, "hasRoute"],
          value: hasRoute
        }
      ]
    }
  };
}

export async function registerRouteContextMenu(
  port: RouteContextMenuPort,
  service: RouteContextMenuActionService,
  iconUrl: string
): Promise<() => Promise<void>> {
  // Keep a single Owlbear context-menu registration alive for the whole extension
  // session. Only its matching icon changes when the clone's route metadata changes.
  // Replacing whole context-menu registrations for SET/EDIT states proved brittle when
  // a global turn rewrites ship metadata and the local clone is reconciled in place.
  const entry: RouteContextMenuEntry = {
    id: ROUTE_SET_CONTEXT_MENU_ID,
    icons: [
      routeIcon("Изменить маршрут", true, iconUrl),
      routeIcon("Задать маршрут", false, iconUrl)
    ],
    onClick: async (context) => {
      const itemId = context.items[0]?.id;
      if (!itemId) return;
      await service.openRouteForLocalItem(itemId);
    }
  };

  await port.create(entry);
  return async () => {
    await port.remove(entry.id);
  };
}
