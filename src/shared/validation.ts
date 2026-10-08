import { DEFAULT_CONSCRIPTION_LAWS, DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "./constants";
import type {
  ArmyMovementState,
  ArmyOverrides,
  ArmyState,
  ArmyStatus,
  ArmyUpgrades,
  BarrierState,
  BarrierVisibility,
  BattleGroup,
  CellState,
  ConscriptionLaw,
  DemographyAuditEntry,
  DetectionMode,
  GridCellCoord,
  GridMapState,
  LRTransaction,
  LRTransactionKind,
  LRTransactionStatus,
  MovementDomain,
  NavalBattleRequest,
  NavalBattleShipSnapshot,
  NavalBattleState,
  NavalInitiativeEntry,
  NavalInterceptionState,
  PlannedRoute,
  SceneSettings,
  SceneState,
  ShipClassId,
  ShipFacing,
  ShipState,
  ShipStatus,
  Side,
  SideRelation,
  StateDemography,
  StateEntity,
  TerrainRegistryState,
  TerrainType,
  TransportEmbarkRequest,
  TurnPhase,
  TurnState,
  UpgradeTrack,
  UpgradeVariant,
  ValidationResult,
  Vector2,
  VisibilityRecalculationMode,
  WarState
} from "./types";
import { parseArmyTokenAsset } from "./armyTokenAsset";

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

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && nonNegative(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function validTimeZone(value: unknown, fallback: string): string {
  if (!nonEmptyString(value)) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return fallback;
  }
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

function normalizeGridCells(value: unknown): GridCellCoord[] {
  return Array.isArray(value)
    ? value.map(normalizeGridCell).filter((cell): cell is GridCellCoord => cell !== undefined)
    : [];
}

function normalizeSettings(value: unknown): SceneSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  const rawArmyFormationCostPerHp = nonNegativeInteger(value.armyFormationCostPerHp)
    ? value.armyFormationCostPerHp
    : (DEFAULT_SETTINGS.armyFormationCostPerHp ?? 10000);
  // 5,000 was the previous built-in formation rate. The rules now define 10,000/HP.
  const armyFormationCostPerHp = rawArmyFormationCostPerHp === 5000
    ? 10000
    : rawArmyFormationCostPerHp;
  const armyHealingCostPerHp = nonNegativeInteger(value.armyHealingCostPerHp)
    ? value.armyHealingCostPerHp
    : (DEFAULT_SETTINGS.armyHealingCostPerHp ?? 5000);
  const hospitalHealingCostPerHp = nonNegativeInteger(value.hospitalHealingCostPerHp)
    ? value.hospitalHealingCostPerHp
    : (DEFAULT_SETTINGS.hospitalHealingCostPerHp ?? 2500);
  const detectionMode: DetectionMode = enumValue(value.detectionMode, ["INDEPENDENT", "MUTUAL"])
    ? value.detectionMode
    : DEFAULT_SETTINGS.detectionMode;
  const visibilityRecalculationMode: VisibilityRecalculationMode = enumValue(
    value.visibilityRecalculationMode,
    ["ON_DROP", "REALTIME"]
  )
    ? value.visibilityRecalculationMode
    : DEFAULT_SETTINGS.visibilityRecalculationMode;
  const populationSheetCsvUrl = nonEmptyString(value.populationSheetCsvUrl)
    ? value.populationSheetCsvUrl.trim()
    : DEFAULT_SETTINGS.populationSheetCsvUrl;
  const conscriptionSheetCsvUrl = nonEmptyString(value.conscriptionSheetCsvUrl)
    ? value.conscriptionSheetCsvUrl.trim()
    : DEFAULT_SETTINGS.conscriptionSheetCsvUrl;
  const sheetWritebackUrl = typeof value.sheetWritebackUrl === "string"
    ? value.sheetWritebackUrl.trim()
    : DEFAULT_SETTINGS.sheetWritebackUrl;
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
        : DEFAULT_SETTINGS.interpolationEnabled,
    armyFormationCostPerHp,
    armyHealingCostPerHp,
    hospitalHealingCostPerHp,
    populationTimeZone: validTimeZone(value.populationTimeZone, DEFAULT_SETTINGS.populationTimeZone ?? "Europe/Moscow"),
    ...(populationSheetCsvUrl ? { populationSheetCsvUrl } : {}),
    ...(conscriptionSheetCsvUrl ? { conscriptionSheetCsvUrl } : {}),
    ...(sheetWritebackUrl !== undefined ? { sheetWritebackUrl } : {})
  };
}

function normalizeConscriptionLaw(value: unknown): ConscriptionLaw | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name) || !nonNegative(value.rate)) return undefined;
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    rate: Math.min(1, value.rate),
    active: value.active !== false
  };
}

function normalizeConscriptionLaws(value: unknown): ConscriptionLaw[] {
  const laws = Array.isArray(value)
    ? value.map(normalizeConscriptionLaw).filter((law): law is ConscriptionLaw => law !== undefined)
    : [];
  return laws.length > 0
    ? [...new Map(laws.map((law) => [law.id, law])).values()]
    : structuredClone(DEFAULT_CONSCRIPTION_LAWS);
}

function normalizeStateDemography(value: unknown): StateDemography | undefined {
  if (!isRecord(value) || !nonEmptyString(value.stateId) || !nonNegative(value.population) ||
      !positive(value.populationGrowthFactor) || !nonNegative(value.humanResource) ||
      !nonEmptyString(value.conscriptionLawId) || !nonNegative(value.conscriptionRate) ||
      !nonNegative(value.humanResourceCapacity)) return undefined;
  return {
    stateId: value.stateId.trim(),
    population: value.population,
    populationGrowthFactor: value.populationGrowthFactor,
    humanResource: Math.min(value.humanResource, value.humanResourceCapacity),
    conscriptionLawId: value.conscriptionLawId.trim(),
    conscriptionRate: Math.min(1, value.conscriptionRate),
    humanResourceCapacity: value.humanResourceCapacity,
    lastPopulationCalculationDate: value.lastPopulationCalculationDate === null || nonEmptyString(value.lastPopulationCalculationDate)
      ? value.lastPopulationCalculationDate as string | null
      : null
  };
}

function normalizeDemographics(value: unknown, stateIds?: ReadonlySet<string>): StateDemography[] {
  const records = Array.isArray(value)
    ? value
        .map(normalizeStateDemography)
        .filter((record): record is StateDemography => record !== undefined && (!stateIds || stateIds.size === 0 || stateIds.has(record.stateId)))
    : [];
  return [...new Map(records.map((record) => [record.stateId, record])).values()];
}

function normalizeDemographyAuditEntry(value: unknown): DemographyAuditEntry | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.stateId) ||
      !nonEmptyString(value.actorPlayerId) || !nonEmptyString(value.reason) || !nonEmptyString(value.createdAt) ||
      !isRecord(value.changes)) return undefined;
  const changes: DemographyAuditEntry["changes"] = {};
  for (const [key, rawChange] of Object.entries(value.changes)) {
    if (!isRecord(rawChange)) continue;
    const before = rawChange.before;
    const after = rawChange.after;
    if ((finiteNumber(before) || nonEmptyString(before)) && (finiteNumber(after) || nonEmptyString(after))) {
      changes[key] = { before: before as number | string, after: after as number | string };
    }
  }
  return { id: value.id, stateId: value.stateId, actorPlayerId: value.actorPlayerId, reason: value.reason, changes, createdAt: value.createdAt };
}

function normalizeDemographyAudit(value: unknown): DemographyAuditEntry[] {
  const entries = Array.isArray(value)
    ? value.map(normalizeDemographyAuditEntry).filter((entry): entry is DemographyAuditEntry => entry !== undefined)
    : [];
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

function normalizeLRTransaction(value: unknown): LRTransaction | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.requestId) ||
      !nonEmptyString(value.createdAt) || !nonNegativeInteger(value.turnNumber) ||
      !nonEmptyString(value.actorPlayerId) || !nonEmptyString(value.sideId) ||
      !nonEmptyString(value.sideName) || !nonEmptyString(value.armyId) ||
      !nonEmptyString(value.armyName) || !nonNegativeInteger(value.hp) ||
      !nonNegativeInteger(value.ratePerHp) || !nonNegativeInteger(value.amount)) return undefined;
  if (!enumValue<LRTransactionKind>(value.kind, ["FORMATION", "COMPLETION", "HEALING"]) ||
      !enumValue<LRTransactionStatus>(value.status, ["PENDING", "RECORDED"])) return undefined;
  const transaction: LRTransaction = {
    id: value.id,
    requestId: value.requestId,
    createdAt: value.createdAt,
    turnNumber: value.turnNumber,
    actorPlayerId: value.actorPlayerId,
    sideId: value.sideId,
    sideName: value.sideName,
    cityId: value.cityId === null || nonEmptyString(value.cityId) ? value.cityId as string | null : null,
    cityName: value.cityName === null || nonEmptyString(value.cityName) ? value.cityName as string | null : null,
    armyId: value.armyId,
    armyName: value.armyName,
    kind: value.kind,
    hp: value.hp,
    ratePerHp: value.ratePerHp,
    amount: value.amount,
    status: value.status
  };
  if (nonEmptyString(value.recordedByPlayerId)) transaction.recordedByPlayerId = value.recordedByPlayerId;
  if (nonEmptyString(value.recordedAt)) transaction.recordedAt = value.recordedAt;
  if (value.stateId === null || nonEmptyString(value.stateId)) transaction.stateId = value.stateId as string | null;
  if (value.stateName === null || nonEmptyString(value.stateName)) transaction.stateName = value.stateName as string | null;
  if (value.factionId === null || nonEmptyString(value.factionId)) transaction.factionId = value.factionId as string | null;
  if (value.factionName === null || nonEmptyString(value.factionName)) transaction.factionName = value.factionName as string | null;
  if (nonNegative(value.balanceBefore)) transaction.balanceBefore = value.balanceBefore;
  if (nonNegative(value.balanceAfter)) transaction.balanceAfter = value.balanceAfter;
  return transaction;
}

function normalizeSide(value: unknown): Side | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name)) return undefined;
  const playerIds = uniqueStrings(value.playerIds);
  const leaderPlayerIds = uniqueStrings(value.leaderPlayerIds);
  const armyTokenAsset = parseArmyTokenAsset(value.armyTokenAsset);
  return {
    id: value.id,
    name: value.name,
    color: nonEmptyString(value.color) ? value.color : "#607d8b",
    playerIds: [...new Set([...playerIds, ...leaderPlayerIds])],
    leaderPlayerIds,
    stateId: value.stateId === null || nonEmptyString(value.stateId) ? value.stateId as string | null : null,
    ...(nonNegativeInteger(value.militaryInfluence) ? { militaryInfluence: value.militaryInfluence } : {}),
    ...(armyTokenAsset ? { armyTokenAsset } : {})
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
    active: typeof value.active === "boolean" ? value.active : true,
    ...(nonNegativeInteger(value.militaryInfluence) ? { militaryInfluence: value.militaryInfluence } : {}),
    ...(value.backendCountry === null || nonEmptyString(value.backendCountry)
      ? { backendCountry: value.backendCountry === null ? null : value.backendCountry.trim() }
      : {})
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

function normalizeMovementDomains(value: unknown): MovementDomain[] {
  if (!Array.isArray(value)) return ["LAND"];
  const domains = [...new Set(value.filter((domain): domain is MovementDomain =>
    enumValue<MovementDomain>(domain, ["LAND", "SEA"])
  ))];
  return domains.length > 0 ? domains : ["LAND"];
}

function normalizeTerrainType(value: unknown, fallbackId?: string): TerrainType | undefined {
  if (!isRecord(value)) return undefined;
  const id = nonEmptyString(value.id) ? value.id : fallbackId;
  if (!id || !nonEmptyString(value.name) || !positiveInteger(value.movementCostUnits)) return undefined;
  const terrain: TerrainType = {
    id,
    name: value.name.trim(),
    movementCostUnits: value.movementCostUnits,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    movementDomains: normalizeMovementDomains(value.movementDomains),
    blocksNavalLos: typeof value.blocksNavalLos === "boolean" ? value.blocksNavalLos : true
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
  const phase: TurnPhase = enumValue<TurnPhase>(value.phase, ["MOVEMENT", "POST_MOVEMENT"])
    ? value.phase
    : DEFAULT_TURN_STATE.phase;
  return {
    turnNumber: positiveInteger(value.turnNumber) ? value.turnNumber : DEFAULT_TURN_STATE.turnNumber,
    phase,
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
      : null,
    ...(isRecord(value.completionPending) &&
      enumValue(value.completionPending.source, ["SCHEDULE", "MANUAL"]) &&
      (value.completionPending.source === "MANUAL" || nonEmptyString(value.completionPending.boundaryId))
      ? { completionPending: {
          source: value.completionPending.source,
          ...(value.completionPending.source === "SCHEDULE"
            ? { boundaryId: value.completionPending.boundaryId as string }
            : {})
        } }
      : {})
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
  const maxUnits = positiveInteger(value.maxUnits) ? value.maxUnits : 10;
  const remainingUnits = Number.isInteger(value.remainingUnits) && nonNegative(value.remainingUnits)
    ? Math.min(value.remainingUnits as number, maxUnits)
    : maxUnits;
  const enteredRouteCellCount = Number.isInteger(value.enteredRouteCellCount) && nonNegative(value.enteredRouteCellCount)
    ? value.enteredRouteCellCount as number
    : 0;
  return { maxUnits, remainingUnits, enteredRouteCellCount };
}

function normalizeUpgradeTrack(value: unknown): UpgradeTrack {
  if (!isRecord(value)) return {};
  const track: UpgradeTrack = {};
  if (enumValue<UpgradeVariant>(value.level1, ["A", "B"])) track.level1 = value.level1;
  if (track.level1 && enumValue<UpgradeVariant>(value.level2, ["A", "B"])) track.level2 = value.level2;
  if (track.level2 && enumValue<UpgradeVariant>(value.level3, ["A", "B"])) track.level3 = value.level3;
  return track;
}

function normalizeArmyUpgrades(value: unknown): ArmyUpgrades {
  const source = isRecord(value) ? value : {};
  const recovery = normalizeUpgradeTrack(source.recovery);
  const motorization = normalizeUpgradeTrack(source.motorization);
  const reconnaissance = normalizeUpgradeTrack(source.reconnaissance);
  let thirdLevelKept = false;
  for (const track of [recovery, motorization, reconnaissance]) {
    if (!track.level3) continue;
    if (!thirdLevelKept) thirdLevelKept = true;
    else delete track.level3;
  }
  return { recovery, motorization, reconnaissance };
}

function normalizePlannedRoute(value: unknown): PlannedRoute {
  if (!isRecord(value)) {
    return { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 0, requiresReplan: false };
  }
  const startCell = normalizeGridCell(value.startCell) ?? { x: 0, y: 0 };
  const cells = normalizeGridCells(value.cells);
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

function nullableNonNegativeInteger(value: unknown): number | null {
  return value === null ? null : nonNegativeInteger(value) ? value : null;
}

function nullableNonNegativeNumber(value: unknown): number | null {
  return value === null ? null : nonNegative(value) ? value : null;
}

function normalizeShip(value: unknown): ShipState | undefined {
  if (!isRecord(value) || value.version !== 1 || value.registered !== true || !nonEmptyString(value.sideId)) {
    return undefined;
  }
  if (!enumValue<ShipClassId>(value.classId, ["BATTLESHIP", "CRUISER", "IRONCLAD", "HOSPITAL", "TRANSPORT"])) {
    return undefined;
  }
  if (!enumValue<ShipStatus>(value.status, ["READY", "IN_NAVAL_BATTLE"])) return undefined;
  if (!enumValue<ShipFacing>(value.facing, ["NORTH", "EAST", "SOUTH", "WEST"])) return undefined;
  return {
    version: 1,
    registered: true,
    sideId: value.sideId,
    classId: value.classId,
    status: value.status,
    hp: nonNegative(value.hp) ? value.hp : 0,
    temporaryHp: nonNegative(value.temporaryHp) ? value.temporaryHp : 0,
    facing: value.facing,
    plannedRoute: normalizeGridCells(value.plannedRoute),
    plannedFacing: enumValue<ShipFacing>(value.plannedFacing, ["NORTH", "EAST", "SOUTH", "WEST"])
      ? value.plannedFacing
      : null,
    globalMovementRemaining: nonNegativeInteger(value.globalMovementRemaining) ? value.globalMovementRemaining : 0,
    movementSpentThisTurn: typeof value.movementSpentThisTurn === "boolean" ? value.movementSpentThisTurn : false,
    battleId: value.battleId === null || nonEmptyString(value.battleId) ? value.battleId as string | null : null,
    detectionOverride: nullableNonNegativeNumber(value.detectionOverride),
    embarkedArmyId: value.embarkedArmyId === null || nonEmptyString(value.embarkedArmyId)
      ? value.embarkedArmyId as string | null
      : null,
    additionalEmbarkedArmyId: value.additionalEmbarkedArmyId === null || nonEmptyString(value.additionalEmbarkedArmyId)
      ? value.additionalEmbarkedArmyId as string | null
      : null,
    shoreBombardmentUsedOnTurn: nullableNonNegativeInteger(value.shoreBombardmentUsedOnTurn),
    logisticsActionUsedOnTurn: nullableNonNegativeInteger(value.logisticsActionUsedOnTurn),
    revision: nonNegative(value.revision) ? Math.floor(value.revision) : 0,
    experience: nonNegative(value.experience) ? value.experience : 0,
    upgrades: normalizeUpgradeTrack(value.upgrades),
    ...(nonNegativeInteger(value.repairedHpThisTurn) ? { repairedHpThisTurn: value.repairedHpThisTurn } : {}),
    ...(nonNegativeInteger(value.repairedOnTurn) ? { repairedOnTurn: value.repairedOnTurn } : {})
  };
}

export function normalizeShipState(raw: unknown): ValidationResult<ShipState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "ship" } };
  if (finiteNumber(raw.version) && raw.version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  const ship = normalizeShip(raw);
  return ship
    ? { ok: true, value: ship }
    : { ok: false, issue: { code: "INVALID_VALUE", path: "ship.required" } };
}

function normalizeShips(value: unknown): Record<string, ShipState> {
  if (!isRecord(value)) return {};
  const ships: Record<string, ShipState> = {};
  for (const [shipId, rawShip] of Object.entries(value)) {
    if (!nonEmptyString(shipId)) continue;
    const ship = normalizeShip(rawShip);
    if (ship) ships[shipId] = ship;
  }
  return ships;
}

function normalizeNavalBattleRequest(value: unknown): NavalBattleRequest | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.initiatingShipId) || !nonEmptyString(value.targetShipId)) {
    return undefined;
  }
  const request: NavalBattleRequest = {
    id: value.id,
    initiatingShipId: value.initiatingShipId,
    targetShipId: value.targetShipId
  };
  if (nonNegativeInteger(value.createdOnTurn)) request.createdOnTurn = value.createdOnTurn;
  return request;
}

function normalizeTransportEmbarkRequest(value: unknown): TransportEmbarkRequest | undefined {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.shipId) || !nonEmptyString(value.armyId)) {
    return undefined;
  }
  return { id: value.id, shipId: value.shipId, armyId: value.armyId };
}

function normalizeNavalBattleSnapshot(value: unknown): NavalBattleShipSnapshot | undefined {
  if (!isRecord(value) || !nonEmptyString(value.shipId)) return undefined;
  const strategicCell = normalizeGridCell(value.strategicCell);
  const strategicPosition = normalizeVector(value.strategicPosition);
  if (!strategicCell || !strategicPosition || !enumValue<ShipFacing>(value.strategicFacing, ["NORTH", "EAST", "SOUTH", "WEST"])) {
    return undefined;
  }
  return { shipId: value.shipId, strategicCell, strategicPosition, strategicFacing: value.strategicFacing };
}

function normalizeNavalInitiativeEntry(value: unknown): NavalInitiativeEntry | undefined {
  if (!isRecord(value) || !nonEmptyString(value.shipId) || !finiteNumber(value.initialRoll) || !finiteNumber(value.bonus) || !finiteNumber(value.total)) {
    return undefined;
  }
  const tieBreakRolls = Array.isArray(value.tieBreakRolls)
    ? value.tieBreakRolls.filter(finiteNumber)
    : [];
  return {
    shipId: value.shipId,
    initialRoll: value.initialRoll,
    bonus: value.bonus,
    total: value.total,
    tieBreakRolls
  };
}

function normalizeNumberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, rawNumber] of Object.entries(value)) {
    if (nonEmptyString(key) && nonNegative(rawNumber)) result[key] = rawNumber;
  }
  return result;
}

function normalizeBooleanMap(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  const result: Record<string, boolean> = {};
  for (const [key, rawBoolean] of Object.entries(value)) {
    if (nonEmptyString(key) && typeof rawBoolean === "boolean") result[key] = rawBoolean;
  }
  return result;
}

function normalizeNavalInterceptions(value: unknown): Record<string, NavalInterceptionState> {
  if (!isRecord(value)) return {};
  const result: Record<string, NavalInterceptionState> = {};
  for (const [shipId, rawInterception] of Object.entries(value)) {
    if (
      !nonEmptyString(shipId) ||
      !isRecord(rawInterception) ||
      !nonEmptyString(rawInterception.cruiserShipId) ||
      !nonNegativeInteger(rawInterception.activatedRoundNumber)
    ) continue;
    result[shipId] = {
      cruiserShipId: rawInterception.cruiserShipId,
      activatedRoundNumber: rawInterception.activatedRoundNumber
    };
  }
  return result;
}

function normalizeNavalBattle(value: unknown): NavalBattleState | undefined {
  if (!isRecord(value) || value.version !== 1 || !nonEmptyString(value.id) || !nonEmptyString(value.initiatorSideId)) {
    return undefined;
  }
  const snapshots: Record<string, NavalBattleShipSnapshot> = {};
  if (isRecord(value.snapshots)) {
    for (const [shipId, rawSnapshot] of Object.entries(value.snapshots)) {
      const snapshot = normalizeNavalBattleSnapshot(rawSnapshot);
      if (snapshot) snapshots[shipId] = snapshot;
    }
  }
  const initiative = Array.isArray(value.initiative)
    ? value.initiative.map(normalizeNavalInitiativeEntry).filter((entry): entry is NavalInitiativeEntry => entry !== undefined)
    : [];
  const status = enumValue(value.status, ["ACTIVE", "COMPLETED"] as const) ? value.status : "ACTIVE";
  return {
    version: 1,
    id: value.id,
    requestId: value.requestId === null || nonEmptyString(value.requestId) ? value.requestId as string | null : null,
    initiatorSideId: value.initiatorSideId,
    areaCells: normalizeGridCells(value.areaCells),
    participantShipIds: uniqueStrings(value.participantShipIds),
    snapshots,
    initiative,
    roundNumber: positiveInteger(value.roundNumber) ? value.roundNumber : 1,
    currentShipId: value.currentShipId === null || nonEmptyString(value.currentShipId) ? value.currentShipId as string | null : null,
    completedShipIdsThisRound: uniqueStrings(value.completedShipIdsThisRound),
    movementRemainingByShip: normalizeNumberMap(value.movementRemainingByShip),
    actionUsedByShip: normalizeBooleanMap(value.actionUsedByShip),
    interceptions: normalizeNavalInterceptions(value.interceptions),
    exitedShipIds: uniqueStrings(value.exitedShipIds),
    status,
    events: Array.isArray(value.events) ? structuredClone(value.events) : [],
    startedOnTurn: nonNegativeInteger(value.startedOnTurn) ? value.startedOnTurn : 0,
    startedAt: nonNegative(value.startedAt) ? value.startedAt : 0,
    revision: nonNegative(value.revision) ? Math.floor(value.revision) : 0,
    experienceEligibleSideIds: uniqueStrings(value.experienceEligibleSideIds)
  };
}

function normalizeNavalRevealMap(value: unknown): Record<string, Record<string, number>> {
  if (!isRecord(value)) return {};
  const result: Record<string, Record<string, number>> = {};
  for (const [sideId, rawMap] of Object.entries(value)) {
    if (!nonEmptyString(sideId)) continue;
    result[sideId] = normalizeNumberMap(rawMap);
  }
  return result;
}

export function normalizeSceneState(raw: unknown): ValidationResult<SceneState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "scene" } };
  if (finiteNumber(raw.version) && raw.version > 6) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 6) {
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
  const navalBattleRequests = Array.isArray(raw.navalBattleRequests)
    ? raw.navalBattleRequests
        .map(normalizeNavalBattleRequest)
        .filter((request): request is NavalBattleRequest => request !== undefined)
    : [];
  const transportEmbarkRequests = Array.isArray(raw.transportEmbarkRequests)
    ? raw.transportEmbarkRequests
        .map(normalizeTransportEmbarkRequest)
        .filter((request): request is TransportEmbarkRequest => request !== undefined)
    : [];
  const activeNavalBattle = raw.activeNavalBattle === null ? null : normalizeNavalBattle(raw.activeNavalBattle) ?? null;
  const navalBattleHistory = Array.isArray(raw.navalBattleHistory)
    ? raw.navalBattleHistory
        .map(normalizeNavalBattle)
        .filter((battle): battle is NavalBattleState => battle !== undefined)
    : [];
  const lrTransactions = Array.isArray(raw.lrTransactions)
    ? raw.lrTransactions.map(normalizeLRTransaction).filter((entry): entry is LRTransaction => entry !== undefined)
    : [];
  const state: SceneState = {
    version: 6,
    revision: nonNegative(raw.revision) ? Math.floor(raw.revision) : 0,
    settings: normalizeSettings(raw.settings),
    sides: [...new Map(sides.map((side) => [side.id, side])).values()],
    states: [...new Map(states.map((state) => [state.id, state])).values()],
    relations: normalizeRelations(raw.relations),
    battleGroups: [...new Map(battleGroups.map((group) => [group.battleId, group])).values()],
    terrain: normalizeTerrainRegistry(raw.terrain),
    gridMap: normalizeGridMap(raw.gridMap),
    wars: [...new Map(wars.map((war) => [war.id, war])).values()],
    turn: normalizeTurn(raw.turn),
    ships: normalizeShips(raw.ships),
    navalBattleRequests,
    transportEmbarkRequests,
    activeNavalBattle,
    navalBattleHistory,
    navalRevealUntilTurn: normalizeNavalRevealMap(raw.navalRevealUntilTurn),
    lrTransactions,
    demographics: normalizeDemographics(raw.demographics, stateIds),
    conscriptionLaws: normalizeConscriptionLaws(raw.conscriptionLaws),
    demographyAudit: normalizeDemographyAudit(raw.demographyAudit)
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
  if (finiteNumber(raw.version) && raw.version > 4) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  if (raw.version !== 4 || raw.registered !== true || !nonEmptyString(raw.sideId)) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "army.required" } };
  }
  if (!enumValue<ArmyStatus>(raw.status, ["READY", "MOVING", "PAUSED", "IN_BATTLE"])) {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "status" } };
  }
  const route = Array.isArray(raw.route)
    ? raw.route.map(normalizeVector).filter((point): point is Vector2 => point !== undefined)
    : [];
  const value: ArmyState = {
    version: 4,
    registered: true,
    sideId: raw.sideId,
    status: raw.status,
    overrides: normalizeOverrides(raw.overrides),
    route,
    plannedRoute: normalizePlannedRoute(raw.plannedRoute),
    movement: normalizeMovement(raw.movement),
    health: (() => {
      const health = isRecord(raw.health) ? raw.health : {};
      const maxHp = positiveInteger(health.maxHp) ? health.maxHp : 40;
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
          : 0,
        ...(nonNegativeInteger(supply.unsuppliedSinceTurn) ? { unsuppliedSinceTurn: supply.unsuppliedSinceTurn } : {})
      };
    })(),
    experience: nonNegative(raw.experience) ? raw.experience : 0,
    upgrades: normalizeArmyUpgrades(raw.upgrades),
    formation: (() => {
      const formation = isRecord(raw.formation) ? raw.formation : {};
      return {
        active: formation.active === true,
        cityId: formation.cityId === null || nonEmptyString(formation.cityId) ? formation.cityId as string | null : null,
        hpAddedThisTurn: nonNegativeInteger(formation.hpAddedThisTurn) ? formation.hpAddedThisTurn : 0,
        checkedOnTurn: nonNegativeInteger(formation.checkedOnTurn) ? formation.checkedOnTurn : 0
      };
    })(),
    healing: (() => {
      const healing = isRecord(raw.healing) ? raw.healing : {};
      return {
        pending: typeof healing.pending === "boolean" ? healing.pending : false,
        ...(nonNegativeInteger(healing.pendingHp) && healing.pendingHp > 0 ? { pendingHp: healing.pendingHp } : {}),
        requestedOnTurn: healing.requestedOnTurn === null || (Number.isInteger(healing.requestedOnTurn) && nonNegative(healing.requestedOnTurn))
          ? healing.requestedOnTurn as number | null
          : null,
        requestedByPlayerId: healing.requestedByPlayerId === null || nonEmptyString(healing.requestedByPlayerId)
          ? healing.requestedByPlayerId as string | null
          : null,
        hpHealedThisTurn: nonNegativeInteger(healing.hpHealedThisTurn) ? healing.hpHealedThisTurn : 0,
        checkedOnTurn: nonNegativeInteger(healing.checkedOnTurn) ? healing.checkedOnTurn : 0,
        hospitalCityId: healing.hospitalCityId === null || nonEmptyString(healing.hospitalCityId)
          ? healing.hospitalCityId as string | null
          : null
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
    embarkedOnShipId: raw.embarkedOnShipId === null || nonEmptyString(raw.embarkedOnShipId)
      ? raw.embarkedOnShipId as string | null
      : null,
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
