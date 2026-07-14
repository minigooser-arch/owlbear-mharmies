import type { SceneSettings } from "./types";

export const EXTENSION_ID = "com.letopis.army-control";
export const ROUTE_TOOL_ID = `${EXTENSION_ID}/route-tool`;
export const ROUTE_TOOL_MODE_ID = `${ROUTE_TOOL_ID}/draw`;
export const ROUTE_ARMY_ID_KEY = `${ROUTE_TOOL_ID}/army-id`;
export const ROUTE_RETURN_TOOL_KEY = `${ROUTE_TOOL_ID}/return-tool`;

export const METADATA_KEYS = {
  scene: `${EXTENSION_ID}/scene`,
  army: `${EXTENSION_ID}/army`,
  barrier: `${EXTENSION_ID}/barrier`,
  localClone: `${EXTENSION_ID}/local-clone`,
  routeOverlay: `${EXTENSION_ID}/route-overlay`,
  routePreview: `${EXTENSION_ID}/route-preview`,
  barrierOverlay: `${EXTENSION_ID}/barrier-overlay`
} as const;

export const DEFAULT_SETTINGS: SceneSettings = {
  defaultDetectionRangeCells: 6,
  defaultSpeedCellsPerSecond: 0.25,
  defaultCollisionRangeCells: 0.5,
  defaultMaxRouteDistanceCells: 5,
  detectionMode: "INDEPENDENT",
  visibilityRecalculationMode: "ON_DROP",
  allowPlayersToCreateRoutes: true,
  allowPlayersToStartOwnArmies: true,
  movementUpdateRate: 5,
  visibilityUpdateRate: 4,
  interpolationEnabled: true
};
