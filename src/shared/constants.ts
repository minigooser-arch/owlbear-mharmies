import type { ConscriptionLaw, SceneSettings, TerrainRegistryState, TurnState } from "./types";

export const EXTENSION_ID = "com.letopis.army-control";
export const DEFAULT_POPULATION_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1wlTrvSxeoQDPKO0s9C0ooKF3xMqmTfcCDB70y-1X2QA/export?format=csv&gid=64907648";
export const DEFAULT_CONSCRIPTION_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1wlTrvSxeoQDPKO0s9C0ooKF3xMqmTfcCDB70y-1X2QA/export?format=csv&gid=2109091990";
export const PROGRAMMATIC_ONLY_TOOL_FILTER = {
  activeTools: [`${EXTENSION_ID}/__programmatic-only__`]
};
export const ROUTE_TOOL_ID = `${EXTENSION_ID}/route-tool`;
export const ROUTE_TOOL_MODE_ID = `${ROUTE_TOOL_ID}/draw`;
export const ROUTE_ARMY_ID_KEY = `${ROUTE_TOOL_ID}/army-id`;
export const ROUTE_RETURN_TOOL_KEY = `${ROUTE_TOOL_ID}/return-tool`;
export const ROUTE_FINISH_ACTION_ID = `${ROUTE_TOOL_ID}/finish`;
export const ROUTE_UNDO_ACTION_ID = `${ROUTE_TOOL_ID}/undo`;
export const ROUTE_CLEAR_ACTION_ID = `${ROUTE_TOOL_ID}/clear`;
export const ROUTE_CANCEL_ACTION_ID = `${ROUTE_TOOL_ID}/cancel`;
export const SHIP_ROUTE_TOOL_ID = `${EXTENSION_ID}/ship-route-tool`;
export const SHIP_ROUTE_TOOL_MODE_ID = `${SHIP_ROUTE_TOOL_ID}/draw`;
export const SHIP_ROUTE_SHIP_ID_KEY = `${SHIP_ROUTE_TOOL_ID}/ship-id`;
export const SHIP_ROUTE_RETURN_TOOL_KEY = `${SHIP_ROUTE_TOOL_ID}/return-tool`;
export const SHIP_ROUTE_FINISH_ACTION_ID = `${SHIP_ROUTE_TOOL_ID}/finish`;
export const SHIP_ROUTE_UNDO_ACTION_ID = `${SHIP_ROUTE_TOOL_ID}/undo`;
export const SHIP_ROUTE_CLEAR_ACTION_ID = `${SHIP_ROUTE_TOOL_ID}/clear`;
export const SHIP_ROUTE_CANCEL_ACTION_ID = `${SHIP_ROUTE_TOOL_ID}/cancel`;
export const TRANSPORT_LANDING_TOOL_ID = `${EXTENSION_ID}/transport-landing-tool`;
export const TRANSPORT_LANDING_TOOL_MODE_ID = `${TRANSPORT_LANDING_TOOL_ID}/select`;
export const TRANSPORT_LANDING_SHIP_ID_KEY = `${TRANSPORT_LANDING_TOOL_ID}/ship-id`;
export const TRANSPORT_LANDING_ARMY_ID_KEY = `${TRANSPORT_LANDING_TOOL_ID}/army-id`;
export const TRANSPORT_LANDING_RETURN_TOOL_KEY = `${TRANSPORT_LANDING_TOOL_ID}/return-tool`;
export const MAP_BRUSH_TOOL_ID = `${EXTENSION_ID}/map-brush-tool`;
export const MAP_BRUSH_TOOL_MODE_ID = `${MAP_BRUSH_TOOL_ID}/paint`;
export const CELL_COORDINATE_TOOL_ID = `${EXTENSION_ID}/cell-coordinate-tool`;
export const CELL_COORDINATE_TOOL_MODE_ID = `${CELL_COORDINATE_TOOL_ID}/inspect`;
export const CITY_CELL_PICK_CHANNEL = `${CELL_COORDINATE_TOOL_ID}/city-cell-pick`;
export const CITY_CELL_PICK_SESSION_KEY = `${CELL_COORDINATE_TOOL_ID}/city-picker-session`;
export const MAP_BRUSH_MODE_KEY = `${MAP_BRUSH_TOOL_ID}/mode`;
export const MAP_BRUSH_TERRAIN_ID_KEY = `${MAP_BRUSH_TOOL_ID}/terrain-id`;
export const MAP_BRUSH_SIDE_ID_KEY = `${MAP_BRUSH_TOOL_ID}/side-id`;
export const MAP_BRUSH_STATE_ID_KEY = `${MAP_BRUSH_TOOL_ID}/state-id`;
export const MAP_BRUSH_SIZE_KEY = `${MAP_BRUSH_TOOL_ID}/size`;
export const MAP_BRUSH_FACTION_OPERATION_KEY = `${MAP_BRUSH_TOOL_ID}/faction-operation`;
export const MAP_BRUSH_IMPASSABLE_VALUE_KEY = `${MAP_BRUSH_TOOL_ID}/impassable-value`;
export const MAP_BRUSH_ERASER_TARGET_KEY = `${MAP_BRUSH_TOOL_ID}/eraser-target`;
export const NAVAL_BATTLE_AREA_TOOL_ID = `${EXTENSION_ID}/naval-battle-area-tool`;
export const NAVAL_BATTLE_AREA_TOOL_MODE_ID = `${NAVAL_BATTLE_AREA_TOOL_ID}/paint`;
export const NAVAL_BATTLE_AREA_REQUEST_ID_KEY = `${NAVAL_BATTLE_AREA_TOOL_ID}/request-id`;
export const NAVAL_BATTLE_AREA_SESSION_ID_KEY = `${NAVAL_BATTLE_AREA_TOOL_ID}/session-id`;
export const NAVAL_BATTLE_AREA_DRAFT_CHANNEL = `${NAVAL_BATTLE_AREA_TOOL_ID}/draft`;

export const MOVEMENT_UNITS_PER_OP = 2;
export const STRATEGIC_CELL_CHUNKS = 10;
export const MINECRAFT_BLOCKS_PER_CHUNK = 16;
export const STRATEGIC_CELL_BLOCKS = STRATEGIC_CELL_CHUNKS * MINECRAFT_BLOCKS_PER_CHUNK;
export const MINECRAFT_GRID_TOP_RIGHT = { x: 0, z: -10000 } as const;

export const METADATA_KEYS = {
  scene: `${EXTENSION_ID}/scene`,
  gridManifest: `${EXTENSION_ID}/grid-manifest`,
  gridManifestPart: `${EXTENSION_ID}/grid-manifest-part`,
  gridChunk: `${EXTENSION_ID}/grid-chunk`,
  lrLedgerManifest: `${EXTENSION_ID}/lr-ledger-manifest`,
  sheetWritebackQueue: `${EXTENSION_ID}/sheet-writeback-queue`,
  lrLedgerPart: `${EXTENSION_ID}/lr-ledger-part`,
  demographyAuditManifest: `${EXTENSION_ID}/demography-audit-manifest`,
  demographyAuditPart: `${EXTENSION_ID}/demography-audit-part`,
  army: `${EXTENSION_ID}/army`,
  ship: `${EXTENSION_ID}/ship`,
  cityMarker: `${EXTENSION_ID}/city-marker`,
  barrier: `${EXTENSION_ID}/barrier`,
  localClone: `${EXTENSION_ID}/local-clone`,
  entityInteractionProxy: `${EXTENSION_ID}/entity-interaction-proxy`,
  routeOverlay: `${EXTENSION_ID}/route-overlay`,
  supplyOverlay: `${EXTENSION_ID}/supply-overlay`,
  routePreview: `${EXTENSION_ID}/route-preview`,
  shipRouteOverlay: `${EXTENSION_ID}/ship-route-overlay`,
  shipRoutePreview: `${EXTENSION_ID}/ship-route-preview`,
  barrierOverlay: `${EXTENSION_ID}/barrier-overlay`,
  mapOverlay: `${EXTENSION_ID}/map-overlay`,
  /** Legacy key used only to remove the retired gray vision overlay. */
  visionOverlay: `${EXTENSION_ID}/vision-overlay`,
  visionLight: `${EXTENSION_ID}/vision-light`,
  healthOverlay: `${EXTENSION_ID}/health-overlay`,
  navalShipOverlay: `${EXTENSION_ID}/naval-ship-overlay`,
  interceptionOverlay: `${EXTENSION_ID}/interception-overlay`,
  mapBrushPreview: `${EXTENSION_ID}/map-brush-preview`,
  navalBattleAreaPreview: `${EXTENSION_ID}/naval-battle-area-preview`,
  peaceTransferOverlay: `${EXTENSION_ID}/peace-transfer-overlay`,
  coordinateOverlay: `${EXTENSION_ID}/coordinate-overlay`
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
  interpolationEnabled: true,
  armyFormationCostPerHp: 10000,
  armyHealingCostPerHp: 5000,
  hospitalHealingCostPerHp: 2500,
  populationTimeZone: "Europe/Moscow",
  populationSheetCsvUrl: DEFAULT_POPULATION_SHEET_CSV_URL,
  conscriptionSheetCsvUrl: DEFAULT_CONSCRIPTION_SHEET_CSV_URL,
  sheetWritebackUrl: "https://script.google.com/macros/s/AKfycbyWbwzHbtj0IJL96lKu3pMPj0dQD4uTy6vw3iB_aOtLsssX3RT47OcTPrFfgNmYkAmKWQ/exec"
};

export const DEFAULT_CONSCRIPTION_LAWS: ConscriptionLaw[] = [
  { id: "DEMILITARIZED", name: "Демилитаризация", rate: 0, active: true },
  { id: "CONTRACT_SERVICE", name: "Контрактная служба", rate: 0.02, active: true },
  { id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.04, active: true },
  { id: "PARTIAL_MOBILIZATION", name: "Частичная мобилизация", rate: 0.08, active: true },
  { id: "MASS_MOBILIZATION", name: "Массовая мобилизация", rate: 0.18, active: true },
  { id: "GENERAL_MOBILIZATION", name: "Всеобщая мобилизация", rate: 0.24, active: true }
];

export const DEFAULT_TERRAIN: TerrainRegistryState = {
  defaultTerrainId: "sea",
  types: {
    plain: { id: "plain", name: "Равнины", movementCostUnits: 2, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#9ACD66" },
    road: { id: "road", name: "Дорога", movementCostUnits: 1, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#BCaaa4" },
    forest: { id: "forest", name: "Лес", movementCostUnits: 4, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#2E8B57" },
    forest_hills: { id: "forest_hills", name: "Холмы с лесом", movementCostUnits: 6, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#1F5F3A" },
    hills: { id: "hills", name: "Холмы", movementCostUnits: 3, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#B6D7A8" },
    mountains: { id: "mountains", name: "Горы", movementCostUnits: 6, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#808080" },
    swamp: { id: "swamp", name: "Болота", movementCostUnits: 5, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#8A8B5C" },
    desert: { id: "desert", name: "Пустыня", movementCostUnits: 3, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#F3E5AB" },
    tundra: { id: "tundra", name: "Тундра", movementCostUnits: 4, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#FFFFFF" },
    sea: { id: "sea", name: "Океан / озёра", movementCostUnits: 2, enabled: true, movementDomains: ["SEA"], blocksNavalLos: false, color: "#2F6BFF" },
    channel: { id: "channel", name: "Канал", movementCostUnits: 2, enabled: true, movementDomains: ["LAND", "SEA"], blocksNavalLos: false, color: "#4FA3D1" },
    ice: { id: "ice", name: "Льды", movementCostUnits: 4, enabled: true, movementDomains: ["LAND"], blocksNavalLos: true, color: "#87CEEB" }
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

