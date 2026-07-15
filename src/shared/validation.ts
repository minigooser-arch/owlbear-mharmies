import { DEFAULT_SETTINGS } from "./constants";
import type {
  ArmyOverrides,
  ArmyState,
  ArmyStatus,
  BarrierState,
  BarrierVisibility,
  BattleGroup,
  DetectionMode,
  SceneSettings,
  SceneState,
  Side,
  SideRelation,
  ValidationResult,
  Vector2,
  VisibilityRecalculationMode
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: unknown): value is number {
  return finiteNumber(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(nonEmptyString))];
}

function normalizeVector(value: unknown): Vector2 | undefined {
  if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) return undefined;
  return { x: value.x, y: value.y };
}

function normalizeSettings(value: unknown): SceneSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  const detectionMode: DetectionMode = enumValue(value.detectionMode, ["INDEPENDENT", "MUTUAL"])
    ? value.detectionMode
    : DEFAULT_SETTINGS.detectionMode;
  const visibilityRecalculationMode: VisibilityRecalculationMode = enumValue(
    value.visibilityRecalculationMode,
    ["ON_DROP", "REALTIME"]
  )
    ? value.visibilityRecalculationMode
    : DEFAULT_SETTINGS.visibilityRecalculationMode;
  return {
    defaultDetectionRangeCells: nonNegative(value.defaultDetectionRangeCells)
      ? value.defaultDetectionRangeCells
      : DEFAULT_SETTINGS.defaultDetectionRangeCells,
    defaultSpeedCellsPerSecond: positive(value.defaultSpeedCellsPerSecond)
      ? value.defaultSpeedCellsPerSecond
      : DEFAULT_SETTINGS.defaultSpeedCellsPerSecond,
    defaultCollisionRangeCells: nonNegative(value.defaultCollisionRangeCells)
      ? value.defaultCollisionRangeCells
      : DEFAULT_SETTINGS.defaultCollisionRangeCells,
    defaultMaxRouteDistanceCells: nonNegative(value.defaultMaxRouteDistanceCells)
      ? value.defaultMaxRouteDistanceCells
      : DEFAULT_SETTINGS.defaultMaxRouteDistanceCells,
    detectionMode,
    visibilityRecalculationMode,
    allowPlayersToCreateRoutes:
      typeof value.allowPlayersToCreateRoutes === "boolean"
        ? value.allowPlayersToCreateRoutes
        : DEFAULT_SETTINGS.allowPlayersToCreateRoutes,
    allowPlayersToStartOwnArmies:
      typeof value.allowPlayersToStartOwnArmies === "boolean"
        ? value.allowPlayersToStartOwnArmies
        : DEFAULT_SETTINGS.allowPlayersToStartOwnArmies,
    movementUpdateRate: positive(value.movementUpdateRate)
      ? value.movementUpdateRate
      : DEFAULT_SETTINGS.movementUpdateRate,
    visibilityUpdateRate: positive(value.visibilityUpdateRate)
      ? value.visibilityUpdateRate
      : DEFAULT_SETTINGS.visibilityUpdateRate,
    interpolationEnabled:
      typeof value.interpolationEnabled === "boolean"
        ? value.interpolationEnabled
        : DEFAULT_SETTINGS.interpolationEnabled
  };
}

function normalizeSide(value: unknown): Side | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name)) return undefined;
  const playerIds = uniqueStrings(value.playerIds);
  const leaderPlayerIds = uniqueStrings(value.leaderPlayerIds);
  return {
    id: value.id,
    name: value.name,
    color: nonEmptyString(value.color) ? value.color : "#607d8b",
    playerIds: [...new Set([...playerIds, ...leaderPlayerIds])],
    leaderPlayerIds
  };
}

function normalizeBattleGroup(value: unknown): BattleGroup | undefined {
  if (!isRecord(value) || !nonEmptyString(value.battleId) || !nonEmptyString(value.name)) {
    return undefined;
  }
  return {
    battleId: value.battleId,
    name: value.name,
    participantIds: uniqueStrings(value.participantIds),
    revision: nonNegative(value.revision) ? Math.floor(value.revision) : 0
  };
}

function normalizeRelations(value: unknown): Record<string, Record<string, SideRelation>> {
  if (!isRecord(value)) return {};
  const result: Record<string, Record<string, SideRelation>> = {};
  for (const [leftId, entries] of Object.entries(value)) {
    if (!nonEmptyString(leftId) || !isRecord(entries)) continue;
    const normalized: Record<string, SideRelation> = {};
    for (const [rightId, relation] of Object.entries(entries)) {
      if (nonEmptyString(rightId) && enumValue(relation, ["ALLY", "NEUTRAL", "ENEMY"])) {
        normalized[rightId] = relation;
      }
    }
    result[leftId] = normalized;
  }
  return result;
}

function normalizeOverrides(value: unknown): ArmyOverrides {
  if (!isRecord(value)) return {};
  const result: ArmyOverrides = {};
  if (nonNegative(value.detectionRangeCells)) result.detectionRangeCells = value.detectionRangeCells;
  if (positive(value.speedCellsPerSecond)) result.speedCellsPerSecond = value.speedCellsPerSecond;
  if (nonNegative(value.collisionRangeCells)) result.collisionRangeCells = value.collisionRangeCells;
  if (nonNegative(value.maxRouteDistanceCells)) result.maxRouteDistanceCells = value.maxRouteDistanceCells;
  return result;
}

export function normalizeSceneState(raw: unknown): ValidationResult<SceneState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "scene" } };
  if (finiteNumber(raw.version) && raw.version > 3) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 3) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "version" } };
  }
  const sides = Array.isArray(raw.sides)
    ? raw.sides.map(normalizeSide).filter((side): side is Side => side !== undefined)
    : [];
  const battleGroups = Array.isArray(raw.battleGroups)
    ? raw.battleGroups
        .map(normalizeBattleGroup)
        .filter((group): group is BattleGroup => group !== undefined)
    : [];
  const state: SceneState = {
    version: 3,
    revision: nonNegative(raw.revision) ? Math.floor(raw.revision) : 0,
    settings: normalizeSettings(raw.settings),
    sides: [...new Map(sides.map((side) => [side.id, side])).values()],
    relations: normalizeRelations(raw.relations),
    battleGroups: [...new Map(battleGroups.map((group) => [group.battleId, group])).values()]
  };
  if (isRecord(raw.coordinatorLease) && nonEmptyString(raw.coordinatorLease.connectionId)) {
    const { epoch, expiresAt } = raw.coordinatorLease;
    if (nonNegative(epoch) && nonNegative(expiresAt)) {
      state.coordinatorLease = {
        connectionId: raw.coordinatorLease.connectionId,
        epoch: Math.floor(epoch),
        expiresAt
      };
    }
  }
  return { ok: true, value: state };
}

export function normalizeArmyState(raw: unknown): ValidationResult<ArmyState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "army" } };
  if (finiteNumber(raw.version) && raw.version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 1 || raw.registered !== true || !nonEmptyString(raw.sideId)) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "army.required" } };
  }
  if (!enumValue<ArmyStatus>(raw.status, ["READY", "MOVING", "PAUSED", "IN_BATTLE"])) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "status" } };
  }
  const route = Array.isArray(raw.route)
    ? raw.route.map(normalizeVector).filter((point): point is Vector2 => point !== undefined)
    : [];
  const value: ArmyState = {
    version: 1,
    registered: true,
    sideId: raw.sideId,
    status: raw.status,
    overrides: normalizeOverrides(raw.overrides),
    route,
    currentWaypointIndex: nonNegative(raw.currentWaypointIndex)
      ? Math.min(Math.floor(raw.currentWaypointIndex), route.length)
      : 0,
    segmentProgressCells: nonNegative(raw.segmentProgressCells) ? raw.segmentProgressCells : 0,
    ignoresMovementBarriers:
      typeof raw.ignoresMovementBarriers === "boolean" ? raw.ignoresMovementBarriers : false,
    ignoresVisionBarriers:
      typeof raw.ignoresVisionBarriers === "boolean" ? raw.ignoresVisionBarriers : false,
    revision: nonNegative(raw.revision) ? Math.floor(raw.revision) : 0
  };
  if (nonEmptyString(raw.directOwnerPlayerId)) value.directOwnerPlayerId = raw.directOwnerPlayerId;
  if (nonEmptyString(raw.battleGroupId)) value.battleGroupId = raw.battleGroupId;
  if (enumValue(raw.stopReason, ["BARRIER", "COORDINATOR_GAP", "MANUAL", "ARRIVED"])) {
    value.stopReason = raw.stopReason;
  }
  return { ok: true, value };
}

export function normalizeBarrierState(raw: unknown): ValidationResult<BarrierState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "barrier" } };
  if (finiteNumber(raw.version) && raw.version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 1) return { ok: false, issue: { code: "INVALID_VALUE", path: "version" } };
  const visibility: BarrierVisibility = enumValue(raw.visibility, ["GM_ONLY", "EVERYONE"])
    ? raw.visibility
    : "GM_ONLY";
  return {
    ok: true,
    value: {
      version: 1,
      revision: nonNegative(raw.revision) ? Math.floor(raw.revision) : 0,
      blocksMovement: typeof raw.blocksMovement === "boolean" ? raw.blocksMovement : true,
      blocksVision: typeof raw.blocksVision === "boolean" ? raw.blocksVision : true,
      visibility,
      color: nonEmptyString(raw.color) ? raw.color : "#d32f2f"
    }
  };
}
