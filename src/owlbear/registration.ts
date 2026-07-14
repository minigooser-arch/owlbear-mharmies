import { METADATA_KEYS } from "../shared/constants";
import type { ArmyState, ItemUpdate, SceneItemRecord, SceneState } from "../shared/types";

export type RegistrationErrorCode =
  | "GM_ONLY"
  | "ITEM_NOT_FOUND"
  | "IMAGE_REQUIRED"
  | "SIDE_NOT_FOUND"
  | "ALREADY_REGISTERED";

export class RegistrationError extends Error {
  constructor(readonly code: RegistrationErrorCode) {
    super(code);
    this.name = "RegistrationError";
  }
}

export interface RegistrationPort {
  getRole(): Promise<"GM" | "PLAYER">;
  getItem(itemId: string): Promise<SceneItemRecord | undefined>;
  getSceneState(): Promise<SceneState>;
  updateItem(itemId: string, update: ItemUpdate): Promise<void>;
  deleteLocalItemsForSource(sourceItemId: string): Promise<void>;
}

export async function registerArmy(
  port: RegistrationPort,
  itemId: string,
  sideId: string,
  directOwnerPlayerId?: string
): Promise<ArmyState> {
  if ((await port.getRole()) !== "GM") throw new RegistrationError("GM_ONLY");
  const item = await port.getItem(itemId);
  if (!item) throw new RegistrationError("ITEM_NOT_FOUND");
  if (item.type !== "IMAGE") throw new RegistrationError("IMAGE_REQUIRED");
  if (item.metadata[METADATA_KEYS.army] !== undefined) {
    throw new RegistrationError("ALREADY_REGISTERED");
  }
  const scene = await port.getSceneState();
  if (!scene.sides.some((side) => side.id === sideId)) throw new RegistrationError("SIDE_NOT_FOUND");
  const state: ArmyState = {
    version: 1,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
  if (directOwnerPlayerId) state.directOwnerPlayerId = directOwnerPlayerId;
  await port.updateItem(itemId, {
    visible: false,
    metadata: { ...item.metadata, [METADATA_KEYS.army]: state }
  });
  return state;
}

export async function unregisterArmy(port: RegistrationPort, itemId: string): Promise<void> {
  if ((await port.getRole()) !== "GM") throw new RegistrationError("GM_ONLY");
  const item = await port.getItem(itemId);
  if (!item) throw new RegistrationError("ITEM_NOT_FOUND");
  const metadata = Object.fromEntries(
    Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.army)
  );
  await port.updateItem(itemId, { visible: true, metadata });
  await port.deleteLocalItemsForSource(itemId);
}
