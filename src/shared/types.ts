export interface Vector2 {
  x: number;
  y: number;
}

export interface GridCellCoord {
  x: number;
  y: number;
}

export type ArmyStatus = "READY" | "MOVING" | "PAUSED" | "IN_BATTLE";
export type DetectionMode = "INDEPENDENT" | "MUTUAL";
export type VisibilityRecalculationMode = "ON_DROP" | "REALTIME";
export type SideRelation = "ALLY" | "NEUTRAL" | "ENEMY";
export type BarrierVisibility = "GM_ONLY" | "EVERYONE";
export type MovementDomain = "LAND" | "SEA";
export type TurnPhase = "MOVEMENT" | "POST_MOVEMENT";
export type ShipClassId = "BATTLESHIP" | "CRUISER" | "IRONCLAD" | "HOSPITAL" | "TRANSPORT";
export type ShipFacing = "NORTH" | "EAST" | "SOUTH" | "WEST";
export type ShipStatus = "READY" | "IN_NAVAL_BATTLE";

export interface SceneSettings {
  defaultDetectionRangeCells: number;
  defaultSpeedCellsPerSecond: number;
  defaultCollisionRangeCells: number;
  /** Legacy setting retained for migration/backward-compatible administration. */
  defaultMaxRouteDistanceCells: number;
  detectionMode: DetectionMode;
  visibilityRecalculationMode: VisibilityRecalculationMode;
  allowPlayersToCreateRoutes: boolean;
  allowPlayersToStartOwnArmies: boolean;
  movementUpdateRate: number;
  visibilityUpdateRate: number;
  interpolationEnabled: boolean;
}

export interface Side {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  leaderPlayerIds: string[];
  /** State the faction belongs to. Null for stateless factions. */
  stateId: string | null;
}

export interface StateEntity {
  id: string;
  name: string;
  rulingFactionId: string | null;
  active: boolean;
}

export interface BattleGroup {
  battleId: string;
  name: string;
  participantIds: string[];
  revision: number;
}

export interface CoordinatorLease {
  connectionId: string;
  epoch: number;
  expiresAt: number;
}

export interface TerrainType {
  id: string;
  name: string;
  movementCostUnits: number;
  enabled: boolean;
  /** Missing on legacy v5 inputs; interpreted as LAND until migration. */
  movementDomains?: MovementDomain[];
  /** Missing on legacy v5 inputs; interpreted as true until migration. */
  blocksNavalLos?: boolean;
  color?: string;
}

export interface TerrainRegistryState {
  defaultTerrainId: string;
  types: Record<string, TerrainType>;
}

export interface CellState {
  /** null means use the registry default terrain. */
  terrainId: string | null;
  impassable: boolean;
  /** Peace-time movement access; independent from state ownership. */
  factionTerritoryIds: string[];
  /** Internationally recognized state owner. */
  recognizedStateId: string | null;
  /** Current de-facto state controller. */
  deFactoStateId: string | null;
}

export interface GridMapState {
  version: 1;
  cells: Record<string, CellState>;
  revision: number;
}

export interface WarState {
  id: string;
  name: string;
  participantFactionIds: string[];
  participantStateIds: string[];
  active: boolean;
}

export interface TurnState {
  turnNumber: number;
  /** Missing on legacy v5 inputs; migration supplies MOVEMENT. */
  phase?: TurnPhase;
  autoTurnsPaused: boolean;
  deferredUntil: string | null;
  lastCompletedAt: string | null;
  lastCompletedBy: "SCHEDULE" | "MANUAL" | null;
  lastProcessedBoundaryId: string | null;
}

export interface ShipState {
  version: 1;
  registered: true;
  sideId: string;
  classId: ShipClassId;
  status: ShipStatus;
  hp: number;
  temporaryHp: number;
  facing: ShipFacing;
  plannedRoute: GridCellCoord[];
  globalMovementRemaining: number;
  movementSpentThisTurn: boolean;
  battleId: string | null;
  detectionOverride: number | null;
  embarkedArmyId: string | null;
  shoreBombardmentUsedOnTurn: number | null;
  logisticsActionUsedOnTurn: number | null;
  revision: number;
}

export interface NavalBattleRequest {
  id: string;
  initiatingShipId: string;
  targetShipId: string;
  createdOnTurn?: number;
}

export interface TransportEmbarkRequest {
  id: string;
  shipId: string;
  armyId: string;
}

export interface NavalBattleShipSnapshot {
  shipId: string;
  strategicCell: GridCellCoord;
  strategicPosition: Vector2;
  strategicFacing: ShipFacing;
}

export interface NavalInitiativeEntry {
  shipId: string;
  initialRoll: number;
  bonus: number;
  total: number;
  tieBreakRolls: number[];
}

export interface NavalBattleState {
  version: 1;
  id: string;
  requestId: string | null;
  initiatorSideId: string;
  areaCells: GridCellCoord[];
  participantShipIds: string[];
  snapshots: Record<string, NavalBattleShipSnapshot>;
  initiative: NavalInitiativeEntry[];
  roundNumber: number;
  currentShipId: string | null;
  completedShipIdsThisRound: string[];
  movementRemainingByShip: Record<string, number>;
  actionUsedByShip: Record<string, boolean>;
  exitedShipIds: string[];
  status: "ACTIVE" | "COMPLETED";
  events: unknown[];
  startedOnTurn: number;
  startedAt: number;
  revision: number;
}

/**
 * Boundary-compatible scene shape. Legacy v5 data is accepted here so old callers and
 * migration fixtures remain representable; normalizeSceneState always returns NavalSceneState.
 */
export interface SceneState {
  version: 5 | 6;
  revision: number;
  settings: SceneSettings;
  sides: Side[];
  states: StateEntity[];
  relations: Record<string, Record<string, SideRelation>>;
  battleGroups: BattleGroup[];
  terrain: TerrainRegistryState;
  gridMap: GridMapState;
  wars: WarState[];
  turn: TurnState;
  ships?: Record<string, ShipState>;
  navalBattleRequests?: NavalBattleRequest[];
  transportEmbarkRequests?: TransportEmbarkRequest[];
  activeNavalBattle?: NavalBattleState | null;
  navalBattleHistory?: NavalBattleState[];
  navalRevealUntilTurn?: Record<string, Record<string, number>>;
  coordinatorLease?: CoordinatorLease;
}

export interface NavalSceneState extends SceneState {
  version: 6;
  ships: Record<string, ShipState>;
  navalBattleRequests: NavalBattleRequest[];
  activeNavalBattle: NavalBattleState | null;
  navalBattleHistory: NavalBattleState[];
  navalRevealUntilTurn: Record<string, Record<string, number>>;
  turn: TurnState & { phase: TurnPhase };
}

export interface ArmyOverrides {
  detectionRangeCells?: number;
  speedCellsPerSecond?: number;
  collisionRangeCells?: number;
  /** Legacy route budget in cells. 2 internal movement units are created per cell. */
  maxRouteDistanceCells?: number;
}

export type MovementDenialReason =
  | "NOT_ORTHOGONAL"
  | "OUTSIDE_MAP"
  | "IMPASSABLE"
  | "OUTSIDE_FACTION_TERRITORY"
  | "INVALID_TERRAIN"
  | "INSUFFICIENT_MOVEMENT_POINTS"
  | "ARMY_STATE_BLOCKS_MOVEMENT"
  | "BARRIER";

export interface PlannedRoute {
  startCell: GridCellCoord;
  /** Global turn on which this route is allowed to execute. 0 means legacy/unplanned. */
  executeOnTurn: number;
  cells: GridCellCoord[];
  totalCostUnits: number;
  validatedRevision: number;
  requiresReplan: boolean;
  invalidReason?: MovementDenialReason;
  invalidCell?: GridCellCoord;
}

export interface ArmyMovementState {
  maxUnits: number;
  remainingUnits: number;
  enteredRouteCellCount: number;
}

export interface ArmyHealthState {
  hp: number;
  maxHp: number;
}

export interface ArmySupplyState {
  supplied: boolean;
  checkedOnTurn: number;
}

export interface ArmyDisbandState {
  pending: boolean;
  requestedOnTurn: number | null;
  requestedByPlayerId: string | null;
}

/** Boundary-compatible army shape; normalization always upgrades to version 4. */
export interface ArmyState {
  version: 3 | 4;
  registered: true;
  sideId: string;
  status: ArmyStatus;
  overrides: ArmyOverrides;
  /** Scene-space centers used to animate/render the current route. */
  route: Vector2[];
  /** Authoritative strategic-cell route. */
  plannedRoute: PlannedRoute;
  movement: ArmyMovementState;
  health: ArmyHealthState;
  supply: ArmySupplyState;
  disband: ArmyDisbandState;
  embarkedOnShipId?: string | null;
  currentWaypointIndex: number;
  segmentProgressCells: number;
  ignoresMovementBarriers: boolean;
  ignoresVisionBarriers: boolean;
  revision: number;
  directOwnerPlayerId?: string;
  battleGroupId?: string;
  stopReason?: "BARRIER" | "COORDINATOR_GAP" | "MANUAL" | "ARRIVED" | "INVALID_ROUTE" | "BATTLE";
}

export interface BarrierState {
  version: 1;
  revision: number;
  blocksMovement: boolean;
  blocksVision: boolean;
  visibility: BarrierVisibility;
  color: string;
}

export interface SceneItemRecord {
  id: string;
  type: string;
  name?: string;
  position: Vector2;
  rotation?: number;
  scale?: Vector2;
  layer?: string;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ItemUpdate {
  position?: Vector2;
  visible?: boolean;
  locked?: boolean;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export const COMMAND_PROTOCOL_VERSION = 4 as const;

export interface CommandEnvelope {
  protocolVersion: typeof COMMAND_PROTOCOL_VERSION;
  requestId: string;
  senderPlayerId: string;
  senderConnectionId: string;
  expectedRevision: number;
}

export type CellPropertyTarget = "TERRAIN" | "IMPASSABLE" | "SELECTED_FACTION" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ALL";

export type ArmyCommandPayload =
  (
    | { type: "REGISTER_ARMY"; itemId: string; sideId: string }
    | { type: "UNREGISTER_ARMY"; armyId: string }
    | { type: "REGISTER_SHIP"; itemId: string; sideId: string; classId: ShipClassId; facing: ShipFacing }
    | { type: "UNREGISTER_SHIP"; shipId: string }
    | { type: "SET_SHIP_ROUTE"; shipId: string; startCell: GridCellCoord; cells: GridCellCoord[] }
    | { type: "SET_SHIP_HP"; shipId: string; hp: number }
    | { type: "SET_SHIP_DETECTION_OVERRIDE"; shipId: string; detectionOverride: number | null }
    | { type: "NAVAL_MOVE_FORWARD"; shipId: string }
    | { type: "NAVAL_TURN_SHIP"; shipId: string; direction: "LEFT" | "RIGHT" }
    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }
    | { type: "NAVAL_HOSPITAL_SUPPORT"; shipId: string; targetShipId: string }
    | { type: "NAVAL_SHORE_BOMBARDMENT"; shipId: string; armyId: string }
    | { type: "SET_ACTIVE_NAVAL_SHIP"; shipId: string }
    | { type: "CONFIRM_NAVAL_SHIP_EXIT"; shipId: string }
    | { type: "EMBARK_ARMY"; shipId: string; armyId: string }
    | { type: "ACCEPT_EMBARK_ARMY"; embarkRequestId: string; shipId: string; armyId: string }
    | { type: "DISEMBARK_ARMY"; shipId: string; armyId: string; targetCell: GridCellCoord }
    | { type: "REQUEST_NAVAL_BATTLE"; initiatingShipId: string; targetShipId: string }
    | {
        type: "START_NAVAL_BATTLE";
        battleId: string;
        navalRequestId: string | null;
        initiatingShipId: string;
        participantShipIds: string[];
        areaCells: GridCellCoord[];
      }
    | { type: "COMPLETE_NAVAL_BATTLE" }
    | { type: "COMPLETE_MOVEMENT_PHASE" }
    | { type: "REOPEN_MOVEMENT_PHASE" }
    | { type: "CREATE_SIDE"; side: Side }
    | { type: "RENAME_SIDE"; sideId: string; name: string }
    | {
        type: "DELETE_SIDE";
        sideId: string;
        strategy: "REASSIGN_ARMIES" | "UNREGISTER_ARMIES";
        targetSideId?: string;
      }
    | {
        type:
          | "ADD_SIDE_PLAYER"
          | "REMOVE_SIDE_PLAYER"
          | "ADD_SIDE_LEADER"
          | "REMOVE_SIDE_LEADER";
        sideId: string;
        playerId: string;
      }
    | { type: "SET_RELATION"; leftSideId: string; rightSideId: string; relation: SideRelation }
    | { type: "UPDATE_SETTINGS"; settings: Partial<SceneSettings> }
    | { type: "UPDATE_ARMY_OVERRIDES"; armyId: string; overrides: ArmyOverrides }
    | { type: "SET_ROUTE"; armyId: string; route: Vector2[]; startCell: GridCellCoord; cells: GridCellCoord[] }
    | { type: "CLEAR_ROUTE"; armyId: string }
    | { type: "MOVE_ARMY"; armyId: string; position: Vector2 }
    | {
        type:
          | "START_ARMY"
          | "PAUSE_ARMY"
          | "RESUME_ARMY"
          | "STOP_ARMY";
        armyId: string;
      }
    | { type: "START_ALL" | "PAUSE_ALL" | "RESUME_ALL" | "STOP_ALL" }
    | { type: "CREATE_BARRIER"; itemId: string; barrier: BarrierState }
    | { type: "UPDATE_BARRIER"; itemId: string; barrier: Partial<BarrierState> }
    | { type: "DELETE_BARRIER"; itemId: string }
    | { type: "RENAME_BATTLE_GROUP"; battleId: string; name: string }
    | { type: "RELEASE_BATTLE_GROUP"; battleId: string }
    | { type: "REMOVE_BATTLE_PARTICIPANT"; battleId: string; armyId: string }
    | { type: "SET_TERRAIN_CELLS"; cells: GridCellCoord[]; terrainId: string | null }
    | { type: "SET_IMPASSABLE_CELLS"; cells: GridCellCoord[]; impassable: boolean }
    | {
        type: "UPDATE_FACTION_TERRITORY_CELLS";
        cells: GridCellCoord[];
        sideId: string;
        operation: "ADD" | "REMOVE";
      }
    | {
        type: "CLEAR_CELL_PROPERTIES";
        cells: GridCellCoord[];
        target: CellPropertyTarget;
        sideId?: string;
      }
    | { type: "CREATE_TERRAIN_TYPE"; terrain: TerrainType }
    | { type: "UPDATE_TERRAIN_TYPE"; terrainId: string; patch: Partial<Omit<TerrainType, "id">> }
    | { type: "DELETE_TERRAIN_TYPE"; terrainId: string; replacementTerrainId?: string }
    | { type: "CREATE_STATE"; state: StateEntity }
    | { type: "UPDATE_STATE"; stateId: string; patch: Partial<Omit<StateEntity, "id">> }
    | { type: "DELETE_STATE"; stateId: string }
    | { type: "SET_SIDE_STATE"; sideId: string; stateId: string | null }
    | { type: "SET_RECOGNIZED_STATE_CELLS"; cells: GridCellCoord[]; stateId: string | null }
    | { type: "SET_DEFACTO_STATE_CELLS"; cells: GridCellCoord[]; stateId: string | null }
    | { type: "SET_ARMY_HP"; armyId: string; hp: number; maxHp?: number }
    | { type: "HEAL_ARMY"; armyId: string; amount: number }
    | { type: "REQUEST_ARMY_DISBAND"; armyId: string }
    | { type: "CREATE_WAR"; war: WarState }
    | { type: "UPDATE_WAR"; warId: string; patch: Partial<Omit<WarState, "id">> }
    | { type: "END_WAR"; warId: string }
    | { type: "DEFER_TURN"; until: string }
    | { type: "CANCEL_TURN_DEFERRAL" }
    | { type: "PAUSE_AUTO_TURNS" }
    | { type: "RESUME_AUTO_TURNS" }
    | { type: "COMPLETE_TURN_NOW" }
  );

export type ArmyCommand = CommandEnvelope & ArmyCommandPayload;

export interface ValidationIssue {
  code: "INVALID_VALUE" | "FUTURE_VERSION";
  path?: string;
  version?: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: ValidationIssue };
