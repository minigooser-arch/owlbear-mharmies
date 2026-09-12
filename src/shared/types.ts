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

/** Boundary-compatible state entity; v7 scene migration always materializes color. */
export interface StateEntity {
  id: string;
  name: string;
  color?: string;
  rulingFactionId: string | null;
  active: boolean;
}

export interface NormalizedStateEntity extends StateEntity {
  color: string;
}

export interface StateRelationState {
  militaryAccess: boolean;
  atWar: boolean;
}

export type StateRelations = Record<string, Record<string, StateRelationState>>;

export interface ForeignPresenceViolation {
  armyId: string;
  homeStateId: string;
  hostStateId: string;
  enteredOnTurn: number;
  checkOnTurn: number;
}

export type ForcedExitReason = "PASSAGE_REVOKED" | "WAR_ENDED" | "BORDER_CHANGED" | "OTHER";

export interface ForcedExitState {
  armyId: string;
  startedOnTurn: number;
  originReason: ForcedExitReason;
}

export interface StrategicCity {
  id: string;
  name: string;
  cells: GridCellCoord[];
  recognizedStateId: string;
  deFactoStateId: string;
  factionInfluenceId: string | null;
  mayorId: string | null;
  isCapital: boolean;
  historicalBuildTypeCount: number;
}

export interface TerritorialScore {
  holderStateId: string;
  opponentStateId: string;
  points: number;
}

export interface RebellionState {
  id: string;
  sourceStateId: string;
  startedOnTurn: number;
  recognizedTerritorySnapshot: GridCellCoord[];
  capitalCityId: string;
  participantFactionIds: string[];
  active: boolean;
}

export interface TurnCheckpointState {
  turnNumber: number;
  illegalPresenceDone: boolean;
  forcedExitDone: boolean;
  supplyDone: boolean;
  encirclementDone: boolean;
  territorialScoreDone: boolean;
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
  /** Legacy faction-territory data retained only for migration/backward-compatible reading. */
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
  /** Optional terminal facing applied when the strategic movement phase resolves. */
  plannedFacing: ShipFacing | null;
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
  requestedByPlayerId: string;
  requestedOnTurn: number;
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

export interface NavalInterceptionState {
  cruiserShipId: string;
  activatedRoundNumber: number;
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
  interceptions?: Record<string, NavalInterceptionState>;
  exitedShipIds: string[];
  status: "ACTIVE" | "COMPLETED";
  events: unknown[];
  startedOnTurn: number;
  startedAt: number;
  revision: number;
}

/**
 * Boundary-compatible scene shape. Legacy v5/v6 data is accepted here so old callers and
 * migration fixtures remain representable; scene migration upgrades persisted state to v7.
 */
export interface SceneState {
  version: 5 | 6 | 7;
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
  stateRelations?: StateRelations;
  foreignPresenceViolations?: ForeignPresenceViolation[];
  forcedExitStates?: ForcedExitState[];
  strategicCities?: StrategicCity[];
  territorialScores?: TerritorialScore[];
  rebellions?: RebellionState[];
  turnCheckpoint?: TurnCheckpointState | null;
  coordinatorLease?: CoordinatorLease;
}

/** Boundary-compatible naval scene shape used by existing tactical code and fixtures. */
export interface NavalSceneState extends SceneState {
  version: 6 | 7;
  ships: Record<string, ShipState>;
  navalBattleRequests: NavalBattleRequest[];
  activeNavalBattle: NavalBattleState | null;
  navalBattleHistory: NavalBattleState[];
  navalRevealUntilTurn: Record<string, Record<string, number>>;
  turn: TurnState & { phase: TurnPhase };
}

/** Fully normalized v7 scene. */
export interface StrategicSceneState extends NavalSceneState {
  version: 7;
  states: NormalizedStateEntity[];
  transportEmbarkRequests: TransportEmbarkRequest[];
  stateRelations: StateRelations;
  foreignPresenceViolations: ForeignPresenceViolation[];
  forcedExitStates: ForcedExitState[];
  strategicCities: StrategicCity[];
  territorialScores: TerritorialScore[];
  rebellions: RebellionState[];
  turnCheckpoint: TurnCheckpointState | null;
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
  | "FOREIGN_STATE_CLOSED"
  | "STATELESS_FACTION"
  | "INVALID_POLITICAL_CONFIG"
  | "WAR_DECLARATION_FAILED"
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
  points?: unknown[];
  strokeColor?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  text?: string;
  color?: string;
  disableHit?: boolean;
}

export interface ItemUpdate {
  position?: Vector2;
  rotation?: number;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

export type ValidationIssue =
  | { code: "FUTURE_VERSION"; version: number }
  | { code: "INVALID_VALUE"; path: string };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: ValidationIssue };

export const COMMAND_PROTOCOL_VERSION = 5 as const;

interface CommandEnvelope {
  protocolVersion: typeof COMMAND_PROTOCOL_VERSION;
  requestId: string;
  senderPlayerId: string;
  senderConnectionId: string;
  expectedRevision: number;
}

export type ArmyCommand = CommandEnvelope & (
  | { type: "CREATE_SIDE"; sideId: string; name: string; color: string }
  | { type: "UPDATE_SIDE"; sideId: string; name?: string; color?: string }
  | { type: "DELETE_SIDE"; sideId: string }
  | { type: "ADD_SIDE_MEMBER"; sideId: string; playerId: string }
  | { type: "REMOVE_SIDE_MEMBER"; sideId: string; playerId: string }
  | { type: "ADD_SIDE_LEADER"; sideId: string; playerId: string }
  | { type: "REMOVE_SIDE_LEADER"; sideId: string; playerId: string }
  | { type: "CREATE_STATE"; state: NormalizedStateEntity }
  | { type: "UPDATE_STATE"; stateId: string; patch: Partial<Pick<NormalizedStateEntity, "name" | "color" | "rulingFactionId" | "active">> }
  | { type: "DELETE_STATE"; stateId: string }
  | { type: "SET_SIDE_STATE"; sideId: string; stateId: string | null }
  | { type: "SET_STATE_MILITARY_ACCESS"; fromStateId: string; toStateId: string; allowed: boolean }
  | { type: "SET_STATE_WAR"; leftStateId: string; rightStateId: string; atWar: boolean }
  | { type: "REGISTER_ARMY"; itemId: string; sideId: string; directOwnerPlayerId?: string }
  | { type: "UNREGISTER_ARMY"; itemId: string }
  | { type: "SET_DIRECT_OWNER"; itemId: string; playerId?: string }
  | { type: "SET_ARMY_HP"; armyId: string; hp: number }
  | { type: "START_ARMY"; itemId: string }
  | { type: "PAUSE_ARMY"; itemId: string }
  | {
      type: "SET_ROUTE";
      armyId: string;
      route: Vector2[];
      startCell: GridCellCoord;
      cells: GridCellCoord[];
    }
  | {
      type: "CREATE_BARRIER";
      itemId: string;
      visibility: BarrierVisibility;
      color: string;
      blocksMovement: boolean;
      blocksVision: boolean;
    }
  | {
      type: "UPDATE_BARRIER";
      itemId: string;
      visibility?: BarrierVisibility;
      color?: string;
      blocksMovement?: boolean;
      blocksVision?: boolean;
    }
  | { type: "DELETE_BARRIER"; itemId: string }
  | { type: "SET_RELATION"; leftSideId: string; rightSideId: string; relation: SideRelation }
  | { type: "CREATE_WAR"; warId: string; name: string; participantFactionIds: string[]; participantStateIds: string[] }
  | { type: "DELETE_WAR"; warId: string }
  | { type: "COMPLETE_TURN_NOW" }
  | { type: "COMPLETE_MOVEMENT_PHASE" }
  | { type: "REGISTER_SHIP"; itemId: string; sideId: string; classId: ShipClassId }
  | { type: "UNREGISTER_SHIP"; itemId: string }
  | { type: "SET_SHIP_HP"; shipId: string; hp: number }
  | { type: "SET_SHIP_ROUTE"; shipId: string; cells: GridCellCoord[]; plannedFacing: ShipFacing | null }
  | { type: "NAVAL_MOVE_FORWARD"; shipId: string; cells: number }
  | { type: "NAVAL_TURN_LEFT"; shipId: string }
  | { type: "NAVAL_TURN_RIGHT"; shipId: string }
  | { type: "NAVAL_BROADSIDE"; shipId: string; targetShipId: string }
  | { type: "NAVAL_INTERCEPT"; shipId: string; targetShipId: string }
  | { type: "NAVAL_END_ACTIVATION"; shipId: string }
  | { type: "REQUEST_NAVAL_BATTLE"; initiatingShipId: string; targetShipId: string }
  | { type: "START_NAVAL_BATTLE"; initiatingShipId: string; participantShipIds: string[]; areaCells: GridCellCoord[]; navalRequestId: string | null }
  | { type: "COMPLETE_NAVAL_BATTLE"; battleId: string }
  | { type: "NAVAL_SHORE_BOMBARDMENT"; shipId: string; armyId: string }
  | { type: "NAVAL_HOSPITAL_SUPPORT"; shipId: string; armyId: string }
  | { type: "EMBARK_ARMY"; shipId: string; armyId: string }
  | { type: "ACCEPT_EMBARK_ARMY"; requestIdToAccept: string }
  | { type: "DISEMBARK_ARMY"; shipId: string; armyId: string; targetCell: GridCellCoord }
  | { type: "SET_SHIP_DETECTION"; shipId: string; detectionOverride: number | null }
  | { type: "SET_ACTIVE_SHIP"; shipId: string }
  | { type: "SET_TERRAIN_CELLS"; cells: GridCellCoord[]; terrainId: string | null }
  | { type: "SET_IMPASSABLE_CELLS"; cells: GridCellCoord[]; impassable: boolean }
  | { type: "SET_RECOGNIZED_STATE_CELLS"; cells: GridCellCoord[]; stateId: string | null }
  | { type: "SET_DEFACTO_STATE_CELLS"; cells: GridCellCoord[]; stateId: string | null }
  | { type: "ERASE_MAP_CELLS"; cells: GridCellCoord[]; target: "TERRAIN" | "IMPASSABLE" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ALL" }
);
