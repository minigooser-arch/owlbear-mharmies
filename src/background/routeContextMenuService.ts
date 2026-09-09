import type { RouteContextMenuActionService } from "../owlbear/routeContextMenu";
import {
  METADATA_KEYS,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";

export interface RouteContextMenuServicePort {
  getLocalItems(): Promise<SceneItemRecord[]>;
  getSceneItems(): Promise<SceneItemRecord[]>;
  getActiveTool(): Promise<string>;
  setToolMetadata(toolId: string, metadata: Record<string, unknown>): Promise<void>;
  activateTool(toolId: string): Promise<void>;
  activateMode(toolId: string, modeId: string): Promise<void>;
  show(message: string, variant: "WARNING"): Promise<void>;
}

function sourceItemIdFromClone(item: SceneItemRecord): string | undefined {
  const metadata = item.metadata[METADATA_KEYS.localClone];
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const sourceItemId = (metadata as Record<string, unknown>).sourceItemId;
  return typeof sourceItemId === "string" ? sourceItemId : undefined;
}

export class RouteContextMenuService implements RouteContextMenuActionService {
  constructor(private readonly port: RouteContextMenuServicePort) {}

  async openRouteForLocalItem(itemId: string): Promise<void> {
    const localItems = await this.port.getLocalItems();
    const clone = localItems.find((item) => item.id === itemId);
    const sourceItemId = clone ? sourceItemIdFromClone(clone) : undefined;
    if (!sourceItemId) {
      await this.port.show("Не удалось определить армию или корабль для маршрута.", "WARNING");
      return;
    }

    const sourceItems = await this.port.getSceneItems();
    const source = sourceItems.find((item) => item.id === sourceItemId);
    if (!source) {
      await this.port.show("Не удалось определить армию или корабль для маршрута.", "WARNING");
      return;
    }

    const returnToolId = await this.port.getActiveTool();
    if (source.metadata[METADATA_KEYS.army] !== undefined) {
      await this.port.setToolMetadata(ROUTE_TOOL_ID, {
        [ROUTE_ARMY_ID_KEY]: sourceItemId,
        [ROUTE_RETURN_TOOL_KEY]: returnToolId
      });
      await this.port.activateTool(ROUTE_TOOL_ID);
      await this.port.activateMode(ROUTE_TOOL_ID, ROUTE_TOOL_MODE_ID);
      return;
    }
    if (source.metadata[METADATA_KEYS.ship] !== undefined) {
      await this.port.setToolMetadata(SHIP_ROUTE_TOOL_ID, {
        [SHIP_ROUTE_SHIP_ID_KEY]: sourceItemId,
        [SHIP_ROUTE_RETURN_TOOL_KEY]: returnToolId
      });
      await this.port.activateTool(SHIP_ROUTE_TOOL_ID);
      await this.port.activateMode(SHIP_ROUTE_TOOL_ID, SHIP_ROUTE_TOOL_MODE_ID);
      return;
    }

    await this.port.show("Не удалось определить армию или корабль для маршрута.", "WARNING");
  }
}
