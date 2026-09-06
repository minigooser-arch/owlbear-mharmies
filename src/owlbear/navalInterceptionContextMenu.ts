import { EXTENSION_ID, METADATA_KEYS } from "../shared/constants";
import type { ExtensionServices, RawExtensionSnapshot } from "../ui/state/useExtensionState";

export const NAVAL_INTERCEPTION_CONTEXT_MENU_ID = `${EXTENSION_ID}/naval-interception`;
const EXTENSION_ICON_URL = "https://minigooser-arch.github.io/owlbear-mharmies/icon-1.2.png";

export interface NavalInterceptionContextMenuItem {
  id: string;
}

export interface NavalInterceptionContextMenuContext {
  items: readonly NavalInterceptionContextMenuItem[];
}

export interface NavalInterceptionContextMenuFilterCondition {
  key: string | readonly string[];
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

export function canActivateInterceptionFromContext(
  snapshot: RawExtensionSnapshot,
  shipId: string
): boolean {
  if (!snapshot.ready || !snapshot.sceneReady || snapshot.futureSchema) return false;
  const ship = snapshot.ships?.find((candidate) => candidate.id === shipId);
  if (!ship) return false;
  if (ship.classId !== "CRUISER" || ship.hp <= 0) return false;
  if (ship.status !== "IN_NAVAL_BATTLE" || ship.navalExited === true) return false;
  if (ship.isCurrentNavalTurn !== true || ship.navalActionUsed === true) return false;
  return snapshot.role === "GM" || snapshot.leaderSideIds.has(ship.sideId);
}

export async function setupNavalInterceptionContextMenu(
  port: NavalInterceptionContextMenuPort,
  services: Pick<ExtensionServices, "getSnapshot" | "send">
): Promise<() => Promise<void>> {
  await port.create({
    id: NAVAL_INTERCEPTION_CONTEXT_MENU_ID,
    icons: [{
      icon: EXTENSION_ICON_URL,
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
      if (!canActivateInterceptionFromContext(services.getSnapshot(), shipId)) return;
      await services.send({ type: "NAVAL_ACTIVATE_INTERCEPTION", shipId });
    }
  });

  return async () => {
    await port.remove(NAVAL_INTERCEPTION_CONTEXT_MENU_ID);
  };
}
