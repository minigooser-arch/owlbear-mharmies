import { EXTENSION_ID, METADATA_KEYS } from "../shared/constants";

export const ROUTE_SET_CONTEXT_MENU_ID = `${EXTENSION_ID}/set-route-from-token`;
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

function routeEntry(
  id: string,
  label: string,
  hasRoute: boolean,
  service: RouteContextMenuActionService,
  iconUrl: string
): RouteContextMenuEntry {
  return {
    id,
    icons: [{
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
    }],
    onClick: async (context) => {
      const itemId = context.items[0]?.id;
      if (!itemId) return;
      await service.openRouteForLocalItem(itemId);
    }
  };
}

export async function registerRouteContextMenu(
  port: RouteContextMenuPort,
  service: RouteContextMenuActionService,
  iconUrl: string
): Promise<() => Promise<void>> {
  const entries = [
    routeEntry(ROUTE_SET_CONTEXT_MENU_ID, "Задать маршрут", false, service, iconUrl),
    routeEntry(ROUTE_EDIT_CONTEXT_MENU_ID, "Изменить маршрут", true, service, iconUrl)
  ];
  for (const entry of entries) await port.create(entry);

  return async () => {
    for (const entry of entries) await port.remove(entry.id);
  };
}
