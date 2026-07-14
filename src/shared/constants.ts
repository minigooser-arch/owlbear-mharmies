import type { SceneSettings } from "./types";

export const EXTENSION_ID = "com.letopis.army-control";

export const METADATA_KEYS = {
  scene: `${EXTENSION_ID}/scene`,
  army: `${EXTENSION_ID}/army`,
  barrier: `${EXTENSION_ID}/barrier`,
  localClone: `${EXTENSION_ID}/local-clone`,
  routeOverlay: `${EXTENSION_ID}/route-overlay`,
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
