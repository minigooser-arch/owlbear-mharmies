import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "./constants";
import type {
  ArmyMovementState,
  ArmyOverrides,
  ArmyState,
  ArmyStatus,
  BarrierState,
  BarrierVisibility,
  BattleGroup,
  CellState,
  DetectionMode,
  GridCellCoord,
  GridMapState,
  PlannedRoute,
  SceneSettings,
  SceneState,
  Side,
  SideRelation,
  StateEntity,
  TerrainRegistryState,
  TerrainType,
  TurnState,
  ValidationResult,
  Vector2,
  VisibilityRecalculationMode,
  WarState
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

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && positive(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(nonEmptyString))].sort();
}

function normalizeVector(value: unknown): Vector2 | undefined {
  if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) return undefined;
  return { x: value.x, y: value.y };
}

function normalizeGridCell(value: unknown): GridCellCoord | undefined {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return undefined;
  return { x: value.x as number, y: value.y as number };
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
    leaderPlayerIds,
    stateId: value.stateId === null || nonEmptyString(value.stateId) ? value.stateId as string | null : null
  };
}


function normalizeStateEntity(value: unknown): StateEntity | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name)) return undefined;
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    rulingFactionId: value.rulingFactionId === null || nonEmptyString(value.rulingFactionId)
      ? value.rulingFactionId as string | null
      : null,
    active: typeof value.active === "boolean" ? value.active : true
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

function normalizeTerrainType(value: unknown, fallbackId?: string): TerrainType | undefined {
  if (!isRecord(value)) return undefined;
  const id = nonEmptyString(value.id) ? value.id : fallbackId;
  if (!id || !nonEmptyString(value.name) || !positiveInteger(value.movementCostUnits)) return undefined;
  const terrain: TerrainType = {
    id,
    name: value.name.trim(),
    movementCostUnits: value.movementCostUnits,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true
  };
  if (nonEmptyString(value.color)) terrain.color = value.color;
  return terrain;
}

function normalizeTerrainRegistry(value: unknown): TerrainRegistryState {
  if (!isRecord(value) || !isRecord(value.types)) return structuredClone(DEFAULT_TERRAIN);
  const types: Record<string, TerrainType> = {};
  for (const [id, rawType] of Object.entries(value.types)) {
    const terrain = normalizeTerrainType(rawType, id);
    if (terrain) types[terrain.id] = terrain;
  }
  for (const [id, terrain] of Object.entries(DEFAULT_TERRAIN.types)) {
    if (!types[id]) types[id] = structuredClone(terrain);
  }
  const requestedDefault = nonEmptyString(value.defaultTerrainId)
    ? value.defaultTerrainId
    : DEFAULT_TERRAIN.defaultTerrainId;
  const defaultTerrainId = types[requestedDefault]
    ? requestedDefault
    : DEFAULT_TERRAIN.defaultTerrainId;
  return { defaultTerrainId, types };
}

function normalizeCellState(value: unknown): CellState | undefined {
  if (!isRecord(value)) return undefined;
  const terrainId = value.terrainId === null || nonEmptyString(value.terrainId)
    ? (value.terrainId as string | null)
    : null;
  return {
    terrainId,
    impassable: typeof value.impassable === "boolean" ? value.impassable : false,
    factionTerritoryIds: uniqueStrings(value.factionTerritoryIds),
    recognizedStateId: value.recognizedStateId === null || nonEmptyString(value.recognizedStateId)
      ? value.recognizedStateId as string | null
      : null,
    deFactoStateId: value.deFactoStateId === null || nonEmptyString(value.deFactoStateId)
      ? value.deFactoStateId as string | null
      : null
  };
}

function normalizeGridMap(value: unknown): GridMapState {
  if (!isRecord(value)) return { version: 1, cells: {}, revision: 0 };
  const cells: Record<string, CellState> = {};
  if (isRecord(value.cells)) {
    for (const [key, rawCell] of Object.entries(value.cells)) {
      const cell = normalizeCellState(rawCell);
      if (cell) cells[key] = cell;
    }
  }
  return {
    version: 1,
    cells,
    revision: nonNegative(value.revision) ? Math.floor(value.revision) : 0
  };
}

function normalizeWar(value: unknown): WarState | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name)) return undefined;
  const participantFactionIds = uniqueStrings(value.participantFactionIds);
  const participantStateIds = uniqueStrings(value.participantStateIds);
  if (participantFactionIds.length < 2 && participantStateIds.length < 2) return undefined;
  return {
    id: value.id,
    name: value.name.trim(),
    participantFactionIds,
    participantStateIds,
    active: typeof value.active === "boolean" ? value.active : true
  };
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return Number.isFinite(Date.parse(value));
}

function normalizeTurn(value: unknown): TurnState {
  if (!isRecord(value)) return { ...DEFAULT_TURN_STATE };
  return {
    turnNumber: positiveInteger(value.turnNumber) ? value.turnNumber : DEFAULT_TURN_STATE.turnNumber,
    autoTurnsPaused: typeof value.autoTurnsPaused === "boolean" ? value.autoTurnsPaused : false,
    deferredUntil: value.deferredUntil === null || validIsoTimestamp(value.deferredUntil)
      ? value.deferredUntil as string | null
      : null,
    lastCompletedAt: value.lastCompletedAt === null || validIsoTimestamp(value.lastCompletedAt)
      ? value.lastCompletedAt as string | null
      : null,
    lastCompletedBy: enumValue(value.lastCompletedBy, ["SCHEDULE", "MANUAL"])
      ? value.lastCompletedBy
      : null,
    lastProcessedBoundaryId: value.lastProcessedBoundaryId === null || nonEmptyString(value.lastProcessedBoundaryId)
      ? value.lastProcessedBoundaryId as string | null
      : null
  };
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

function normalizeMovement(value: unknown): ArmyMovementState {
  if (!isRecord(value)) return { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 };
  const maxUnits = 10;
  const remainingUnits = Number.isInteger(value.remainingUnits) && nonNegative(value.remainingUnits)
    ? Math.min(value.remainingUnits as number, maxUnits)
    : maxUnits;
  const enteredRouteCellCount = Number.isInteger(value.enteredRouteCellCount) && nonNegative(value.enteredRouteCellCount)
    ? value.enteredRouteCellCount as number
    : 0;
  return { maxUnits, remainingUnits, enteredRouteCellCount };
}

function normalizePlannedRoute(value: unknown): PlannedRoute {
  if (!isRecord(value)) {
    return { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 0, requiresReplan: false };
  }
  const startCell = normalizeGridCell(value.startCell) ?? { x: 0, y: 0 };
  const cells = Array.isArray(value.cells)
    ? value.cells.map(normalizeGridCell).filter((cell): cell is GridCellCoord => cell !== undefined)
    : [];
  const planned: PlannedRoute = {
    startCell,
    executeOnTurn: Number.isInteger(value.executeOnTurn) && nonNegative(value.executeOnTurn)
      ? value.executeOnTurn as number
      : 0,
    cells,
    totalCostUnits: Number.isInteger(value.totalCostUnits) && nonNegative(value.totalCostUnits)
      ? value.totalCostUnits as number
      : 0,
    validatedRevision: nonNegative(value.validatedRevision)
      ? Math.floor(value.validatedRevision)
      : 0,
    requiresReplan: typeof value.requiresReplan === "boolean" ? value.requiresReplan : false
  };
  if (enumValue(value.invalidReason, [
    "NOT_ORTHOGONAL",
    "OUTSIDE_MAP",
    "IMPASSABLE",
    "OUTSIDE_FACTION_TERRITORY",
    "INVALID_TERRAIN",
    "INSUFFICIENT_MOVEMENT_POINTS",
    "ARMY_STATE_BLOCKS_MOVEMENT",
    "BARRIER"
  ])) {
    planned.invalidReason = value.invalidReason;
  }
  const invalidCell = normalizeGridCell(value.invalidCell);
  if (invalidCell) planned.invalidCell = invalidCell;
  return planned;
}

export function normalizeSceneState(raw: unknown): ValidationResult<SceneState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "scene" } };
  if (finiteNumber(raw.version) && raw.version > 5) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 5) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "version" } };
  }
  const sides = Array.isArray(raw.sides)
    ? raw.sides.map(normalizeSide).filter((side): side is Side => side !== undefined)
    : [];
  const states = Array.isArray(raw.states)
    ? raw.states.map(normalizeStateEntity).filter((state): state is StateEntity => state !== undefined)
    : [];
  const stateIds = new Set(states.map((state) => state.id));
  const sideIds = new Set(sides.map((side) => side.id));
  for (const side of sides) if (side.stateId && !stateIds.has(side.stateId)) side.stateId = null;
  for (const state of states) if (state.rulingFactionId && !sideIds.has(state.rulingFactionId)) state.rulingFactionId = null;
  const battleGroups = Array.isArray(raw.battleGroups)
    ? raw.battleGroups.map(normalizeBattleGroup).filter((group): group is BattleGroup => group !== undefined)
    : [];
  const wars = Array.isArray(raw.wars)
    ? raw.wars.map(normalizeWar).filter((war): war is WarState => war !== undefined)
    : [];
  const state: SceneState = {
    version: 5,
    revision: nonNegative(raw.revision) ? Math.floor(raw.revision) : 0,
    settings: normalizeSettings(raw.settings),
    sides: [...new Map(sides.map((side) => [side.id, side])).values()],
    states: [...new Map(states.map((state) => [state.id, state])).values()],
    relations: normalizeRelations(raw.relations),
    battleGroups: [...new Map(battleGroups.map((group) => [group.battleId, group])).values()],
    terrain: normalizeTerrainRegistry(raw.terrain),
    gridMap: normalizeGridMap(raw.gridMap),
    wars: [...new Map(wars.map((war) => [war.id, war])).values()],
    turn: normalizeTurn(raw.turn)
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
  if (finiteNumber(raw.version) && raw.version > 3) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 3 || raw.registered !== true || !nonEmptyString(raw.sideId)) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "army.required" } };
  }
  if (!enumValue<ArmyStatus>(raw.status, ["READY", "MOVING", "PAUSED", "IN_BATTLE"])) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "status" } };
  }
  const route = Array.isArray(raw.route)
    ? raw.route.map(normalizeVector).filter((point): point is Vector2 => point !== undefined)
    : [];
  const value: ArmyState = {
    version: 3,
    registered: true,
    sideId: raw.sideId,
    status: raw.status,
    overrides: normalizeOverrides(raw.overrides),
    route,
    plannedRoute: normalizePlannedRoute(raw.plannedRoute),
    movement: normalizeMovement(raw.movement),
    health: (() => {
      const health = isRecord(raw.health) ? raw.health : {};
      const maxHp = positiveInteger(health.maxHp) ? health.maxHp : 50;
      const hp = Number.isInteger(health.hp) && nonNegative(health.hp)
        ? Math.min(health.hp as number, maxHp)
        : maxHp;
      return { hp, maxHp };
    })(),
    supply: (() => {
      const supply = isRecord(raw.supply) ? raw.supply : {};
      return {
        supplied: typeof supply.supplied === "boolean" ? supply.supplied : true,
        checkedOnTurn: Number.isInteger(supply.checkedOnTurn) && nonNegative(supply.checkedOnTurn)
          ? supply.checkedOnTurn as number
          : 0
      };
    })(),
    disband: (() => {
      const disband = isRecord(raw.disband) ? raw.disband : {};
      return {
        pending: typeof disband.pending === "boolean" ? disband.pending : false,
        requestedOnTurn: disband.requestedOnTurn === null || (Number.isInteger(disband.requestedOnTurn) && nonNegative(disband.requestedOnTurn))
          ? disband.requestedOnTurn as number | null
          : null,
        requestedByPlayerId: disband.requestedByPlayerId === null || nonEmptyString(disband.requestedByPlayerId)
          ? disband.requestedByPlayerId as string | null
          : null
      };
    })(),
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
  if (enumValue(raw.stopReason, ["BARRIER", "COORDINATOR_GAP", "MANUAL", "ARRIVED", "INVALID_ROUTE", "BATTLE"])) {
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
