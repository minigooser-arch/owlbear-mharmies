export interface Vector2 {
  x: number;
  y: number;
}

export type ArmyStatus = "READY" | "MOVING" | "PAUSED" | "IN_BATTLE";
export type DetectionMode = "INDEPENDENT" | "MUTUAL";
export type VisibilityRecalculationMode = "ON_DROP" | "REALTIME";
export type SideRelation = "ALLY" | "NEUTRAL" | "ENEMY";
export type BarrierVisibility = "GM_ONLY" | "EVERYONE";

export interface SceneSettings {
  defaultDetectionRangeCells: number;
  defaultSpeedCellsPerSecond: number;
  defaultCollisionRangeCells: number;
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

export interface SceneState {
  version: 3;
  revision: number;
  settings: SceneSettings;
  sides: Side[];
  relations: Record<string, Record<string, SideRelation>>;
  battleGroups: BattleGroup[];
  coordinatorLease?: CoordinatorLease;
}

export interface ArmyOverrides {
  detectionRangeCells?: number;
  speedCellsPerSecond?: number;
  collisionRangeCells?: number;
  maxRouteDistanceCells?: number;
}

export interface ArmyState {
  version: 1;
  registered: true;
  sideId: string;
  status: ArmyStatus;
  overrides: ArmyOverrides;
  route: Vector2[];
  currentWaypointIndex: number;
  segmentProgressCells: number;
  ignoresMovementBarriers: boolean;
  ignoresVisionBarriers: boolean;
  revision: number;
  directOwnerPlayerId?: string;
  battleGroupId?: string;
  stopReason?: "BARRIER" | "COORDINATOR_GAP" | "MANUAL" | "ARRIVED";
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

export const COMMAND_PROTOCOL_VERSION = 2 as const;

export interface CommandEnvelope {
  protocolVersion: typeof COMMAND_PROTOCOL_VERSION;
  requestId: string;
  senderPlayerId: string;
  senderConnectionId: string;
  expectedRevision: number;
}

export type ArmyCommandPayload =
  (
    | { type: "REGISTER_ARMY"; itemId: string; sideId: string }
    | { type: "UNREGISTER_ARMY"; armyId: string }
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
    | { type: "SET_ROUTE"; armyId: string; route: Vector2[] }
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
