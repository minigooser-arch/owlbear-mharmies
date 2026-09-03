import type { SceneSettings, TerrainRegistryState, TurnState } from "./types";

export const EXTENSION_ID = "com.letopis.army-control";
export const ROUTE_TOOL_ID = `${EXTENSION_ID}/route-tool`;
export const ROUTE_TOOL_MODE_ID = `${ROUTE_TOOL_ID}/draw`;
export const ROUTE_ARMY_ID_KEY = `${ROUTE_TOOL_ID}/army-id`;
export const ROUTE_RETURN_TOOL_KEY = `${ROUTE_TOOL_ID}/return-tool`;
export const ROUTE_FINISH_ACTION_ID = `${ROUTE_TOOL_ID}/finish`;
export const ROUTE_UNDO_ACTION_ID = `${ROUTE_TOOL_ID}/undo`;
export const ROUTE_CLEAR_ACTION_ID = `${ROUTE_TOOL_ID}/clear`;
export const ROUTE_CANCEL_ACTION_ID = `${ROUTE_TOOL_ID}/cancel`;
export const MAP_BRUSH_TOOL_ID = `${EXTENSION_ID}/map-brush-tool`;
export const MAP_BRUSH_TOOL_MODE_ID = `${MAP_BRUSH_TOOL_ID}/paint`;
export const MAP_BRUSH_MODE_KEY = `${MAP_BRUSH_TOOL_ID}/mode`;
export const MAP_BRUSH_TERRAIN_ID_KEY = `${MAP_BRUSH_TOOL_ID}/terrain-id`;
export const MAP_BRUSH_SIDE_ID_KEY = `${MAP_BRUSH_TOOL_ID}/side-id`;
export const MAP_BRUSH_STATE_ID_KEY = `${MAP_BRUSH_TOOL_ID}/state-id`;
export const MAP_BRUSH_SIZE_KEY = `${MAP_BRUSH_TOOL_ID}/size`;
export const MAP_BRUSH_FACTION_OPERATION_KEY = `${MAP_BRUSH_TOOL_ID}/faction-operation`;
export const MAP_BRUSH_IMPASSABLE_VALUE_KEY = `${MAP_BRUSH_TOOL_ID}/impassable-value`;
export const MAP_BRUSH_ERASER_TARGET_KEY = `${MAP_BRUSH_TOOL_ID}/eraser-target`;

export const MOVEMENT_UNITS_PER_OP = 2;
export const STRATEGIC_CELL_CHUNKS = 10;
export const MINECRAFT_BLOCKS_PER_CHUNK = 16;
export const STRATEGIC_CELL_BLOCKS = STRATEGIC_CELL_CHUNKS * MINECRAFT_BLOCKS_PER_CHUNK;
export const MINECRAFT_GRID_TOP_RIGHT = { x: 0, z: -10000 } as const;

export const METADATA_KEYS = {
  scene: `${EXTENSION_ID}/scene`,
  army: `${EXTENSION_ID}/army`,
  barrier: `${EXTENSION_ID}/barrier`,
  localClone: `${EXTENSION_ID}/local-clone`,
  routeOverlay: `${EXTENSION_ID}/route-overlay`,
  routePreview: `${EXTENSION_ID}/route-preview`,
  barrierOverlay: `${EXTENSION_ID}/barrier-overlay`,
  mapOverlay: `${EXTENSION_ID}/map-overlay`,
  healthOverlay: `${EXTENSION_ID}/health-overlay`,
  mapBrushPreview: `${EXTENSION_ID}/map-brush-preview`
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

export const DEFAULT_TERRAIN: TerrainRegistryState = {
  defaultTerrainId: "plain",
  types: {
    plain: { id: "plain", name: "Равнина", movementCostUnits: 2, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#90a4ae" },
    road: { id: "road", name: "Дорога", movementCostUnits: 1, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#bcaaa4" },
    forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#66bb6a" },
    mountains: { id: "mountains", name: "Горы", movementCostUnits: 6, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#8d6e63" }
  }
};

export const DEFAULT_TURN_STATE: TurnState & { phase: "MOVEMENT" } = {
  turnNumber: 1,
  phase: "MOVEMENT",
  autoTurnsPaused: false,
  deferredUntil: null,
  lastCompletedAt: null,
  lastCompletedBy: null,
  lastProcessedBoundaryId: null
};
