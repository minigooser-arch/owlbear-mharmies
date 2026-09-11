import type {
  ArmyState,
  BarrierState,
  ForeignPresenceViolation,
  ForcedExitReason,
  ForcedExitState,
  RebellionState,
  SceneState,
  ShipState,
  StateRelations,
  StrategicCity,
  TerritorialScore,
  TurnCheckpointState,
  ValidationResult
} from "../shared/types";
import { compareOrdinal } from "../shared/ordering";
import { DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import {
  normalizeArmyState,
  normalizeBarrierState,
  normalizeSceneState,
  normalizeShipState
} from "../shared/validation";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function versionOf(raw: unknown): number | undefined {
  return isRecord(raw) && typeof raw.version === "number" ? raw.version : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(nonEmptyString))];
}

function normalizeGridCell(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return undefined;
  return { x: value.x as number, y: value.y as number };
}

function uniqueGridCells(value: unknown): Array<{ x: number; y: number }> {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, { x: number; y: number }>();
  for (const raw of value) {
    const cell = normalizeGridCell(raw);
    if (cell) byKey.set(`${cell.x},${cell.y}`, cell);
  }
  return [...byKey.values()];
}

function migrateLegacyTerrainToNavalSafe(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.types)) return structuredClone(DEFAULT_TERRAIN);
  const types = Object.fromEntries(
    Object.entries(value.types).map(([id, rawType]) => [
      id,
      isRecord(rawType)
        ? {
            ...rawType,
            movementDomains: Array.isArray(rawType.movementDomains) ? rawType.movementDomains : ["LAND"],
            blocksNavalLos: typeof rawType.blocksNavalLos === "boolean" ? rawType.blocksNavalLos : true
          }
        : rawType
    ])
  );
  return { ...value, types };
}

function ensureBuiltInTerrains(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.types)) return structuredClone(DEFAULT_TERRAIN);
  const types: Record<string, unknown> = { ...value.types };
  for (const [id, defaultTerrain] of Object.entries(DEFAULT_TERRAIN.types)) {
    const existing = types[id];
    const legacyDefaults: Record<string, { name: string; color: string }> = {
      plain: { name: "Равнина", color: "#90a4ae" },
      forest: { name: "Лес", color: "#66bb6a" },
      mountains: { name: "Горы", color: "#8d6e63" },
      sea: { name: "Море", color: "#42a5f5" }
    };
    const legacy = legacyDefaults[id];
    const existingRecord = isRecord(existing) ? existing : undefined;
    const migrateLegacyPresentation = legacy && existingRecord &&
      existingRecord.name === legacy.name && existingRecord.color === legacy.color;
    types[id] = {
      ...structuredClone(defaultTerrain),
      ...(existingRecord ?? {}),
      ...(migrateLegacyPresentation ? { name: defaultTerrain.name, color: defaultTerrain.color } : {}),
      id,
      ...(id === "sea" ? { movementDomains: ["SEA"], blocksNavalLos: false } : {}),
      ...(id === "ice" ? { movementDomains: ["LAND"], blocksNavalLos: true } : {})
    };
  }
  return { ...value, types };
}

function pairwiseRelationsFromLegacyWars(value: unknown, stateIds: ReadonlySet<string>): StateRelations {
  const result: StateRelations = {};
  if (!Array.isArray(value)) return result;
  for (const rawWar of value) {
    if (!isRecord(rawWar) || rawWar.active === false) continue;
    const participants = uniqueStrings(rawWar.participantStateIds).filter((id) => stateIds.has(id));
    if (participants.length !== 2 || participants[0] === participants[1]) continue;
    const [left, right] = participants as [string, string];
    result[left] ??= {};
    result[right] ??= {};
    result[left][right] = { militaryAccess: false, atWar: true };
    result[right][left] = { militaryAccess: false, atWar: true };
  }
  return result;
}

function normalizeStateRelations(value: unknown, stateIds: ReadonlySet<string>): StateRelations {
  const result: StateRelations = {};
  if (!isRecord(value)) return result;
  for (const [fromStateId, rawTargets] of Object.entries(value)) {
    if (!stateIds.has(fromStateId) || !isRecord(rawTargets)) continue;
    for (const [toStateId, rawRelation] of Object.entries(rawTargets)) {
      if (fromStateId === toStateId || !stateIds.has(toStateId) || !isRecord(rawRelation)) continue;
      result[fromStateId] ??= {};
      result[fromStateId][toStateId] = {
        militaryAccess: rawRelation.militaryAccess === true,
        atWar: rawRelation.atWar === true
      };
    }
  }
  for (const [leftId, targets] of Object.entries(result)) {
    for (const [rightId, relation] of Object.entries(targets)) {
      if (!relation.atWar) continue;
      result[rightId] ??= {};
      const reverse = result[rightId][leftId];
      result[rightId][leftId] = {
        militaryAccess: reverse?.militaryAccess ?? false,
        atWar: true
      };
    }
  }
  return result;
}

function normalizeForeignPresenceViolations(value: unknown, stateIds: ReadonlySet<string>): ForeignPresenceViolation[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, ForeignPresenceViolation>();
  for (const raw of value) {
    if (!isRecord(raw) || !nonEmptyString(raw.armyId) || !nonEmptyString(raw.homeStateId) ||
        !nonEmptyString(raw.hostStateId) || raw.homeStateId === raw.hostStateId ||
        !stateIds.has(raw.homeStateId) || !stateIds.has(raw.hostStateId) ||
        !nonNegativeInteger(raw.enteredOnTurn) || !nonNegativeInteger(raw.checkOnTurn)) continue;
    const violation: ForeignPresenceViolation = {
      armyId: raw.armyId,
      homeStateId: raw.homeStateId,
      hostStateId: raw.hostStateId,
      enteredOnTurn: raw.enteredOnTurn,
      checkOnTurn: Math.max(raw.checkOnTurn, raw.enteredOnTurn + 1)
    };
    result.set(`${violation.armyId}:${violation.hostStateId}`, violation);
  }
  return [...result.values()];
}

function normalizeForcedExitStates(value: unknown): ForcedExitState[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<ForcedExitReason>(["PASSAGE_REVOKED", "WAR_ENDED", "BORDER_CHANGED", "OTHER"]);
  const result = new Map<string, ForcedExitState>();
  for (const raw of value) {
    if (!isRecord(raw) || !nonEmptyString(raw.armyId) || !nonNegativeInteger(raw.startedOnTurn) ||
        !allowed.has(raw.originReason as ForcedExitReason)) continue;
    result.set(raw.armyId, {
      armyId: raw.armyId,
      startedOnTurn: raw.startedOnTurn,
      originReason: raw.originReason as ForcedExitReason
    });
  }
  return [...result.values()];
}

function normalizeStrategicCities(value: unknown, stateIds: ReadonlySet<string>): StrategicCity[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, StrategicCity>();
  for (const raw of value) {
    if (!isRecord(raw) || !nonEmptyString(raw.id) || !nonEmptyString(raw.name) ||
        !nonEmptyString(raw.recognizedStateId) || !nonEmptyString(raw.deFactoStateId) ||
        !stateIds.has(raw.recognizedStateId) || !stateIds.has(raw.deFactoStateId) ||
        !nonNegativeInteger(raw.historicalBuildTypeCount)) continue;
    const cells = uniqueGridCells(raw.cells);
    if (cells.length === 0) continue;
    result.set(raw.id, {
      id: raw.id,
      name: raw.name.trim(),
      cells,
      recognizedStateId: raw.recognizedStateId,
      deFactoStateId: raw.deFactoStateId,
      factionInfluenceId: raw.factionInfluenceId === null || nonEmptyString(raw.factionInfluenceId)
        ? raw.factionInfluenceId as string | null
        : null,
      mayorId: raw.mayorId === null || nonEmptyString(raw.mayorId) ? raw.mayorId as string | null : null,
      isCapital: raw.isCapital === true,
      historicalBuildTypeCount: raw.historicalBuildTypeCount
    });
  }
  return [...result.values()];
}

function normalizeTerritorialScores(value: unknown, stateIds: ReadonlySet<string>): TerritorialScore[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, TerritorialScore>();
  for (const raw of value) {
    if (!isRecord(raw) || !nonEmptyString(raw.holderStateId) || !nonEmptyString(raw.opponentStateId) ||
        raw.holderStateId === raw.opponentStateId || !stateIds.has(raw.holderStateId) ||
        !stateIds.has(raw.opponentStateId) || !nonNegativeInteger(raw.points)) continue;
    const score: TerritorialScore = {
      holderStateId: raw.holderStateId,
      opponentStateId: raw.opponentStateId,
      points: raw.points
    };
    result.set(`${score.holderStateId}:${score.opponentStateId}`, score);
  }
  return [...result.values()];
}

function normalizeRebellions(value: unknown, stateIds: ReadonlySet<string>): RebellionState[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, RebellionState>();
  for (const raw of value) {
    if (!isRecord(raw) || !nonEmptyString(raw.id) || !nonEmptyString(raw.sourceStateId) ||
        !stateIds.has(raw.sourceStateId) || !nonNegativeInteger(raw.startedOnTurn) ||
        !nonEmptyString(raw.capitalCityId)) continue;
    const territory = uniqueGridCells(raw.recognizedTerritorySnapshot);
    if (territory.length === 0) continue;
    result.set(raw.id, {
      id: raw.id,
      sourceStateId: raw.sourceStateId,
      startedOnTurn: raw.startedOnTurn,
      recognizedTerritorySnapshot: territory,
      capitalCityId: raw.capitalCityId,
      participantFactionIds: uniqueStrings(raw.participantFactionIds),
      active: raw.active !== false
    });
  }
  return [...result.values()];
}

function normalizeTurnCheckpoint(value: unknown): TurnCheckpointState | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !nonNegativeInteger(value.turnNumber)) return null;
  return {
    turnNumber: value.turnNumber,
    illegalPresenceDone: value.illegalPresenceDone === true,
    forcedExitDone: value.forcedExitDone === true,
    supplyDone: value.supplyDone === true,
    encirclementDone: value.encirclementDone === true,
    territorialScoreDone: value.territorialScoreDone === true
  };
}

function normalizeStrategicSceneState(raw: UnknownRecord): ValidationResult<SceneState> {
  const core = normalizeSceneState({ ...raw, version: 6 });
  if (!core.ok) return core;

  const rawStates = new Map<string, UnknownRecord>();
  if (Array.isArray(raw.states)) {
    for (const state of raw.states) {
      if (isRecord(state) && nonEmptyString(state.id)) rawStates.set(state.id, state);
    }
  }
  const sidesById = new Map(core.value.sides.map((side) => [side.id, side]));
  const states = core.value.states.map((state) => {
    const rawState = rawStates.get(state.id);
    const ruler = state.rulingFactionId ? sidesById.get(state.rulingFactionId) : undefined;
    const validRuler = ruler?.stateId === state.id;
    return {
      ...state,
      color: rawState && nonEmptyString(rawState.color) ? rawState.color : "#607d8b",
      rulingFactionId: validRuler ? state.rulingFactionId : null,
      active: state.active && validRuler
    };
  });
  const stateIds = new Set(states.map((state) => state.id));

  return {
    ok: true,
    value: {
      ...core.value,
      version: 7,
      states,
      stateRelations: normalizeStateRelations(raw.stateRelations, stateIds),
      foreignPresenceViolations: normalizeForeignPresenceViolations(raw.foreignPresenceViolations, stateIds),
      forcedExitStates: normalizeForcedExitStates(raw.forcedExitStates),
      strategicCities: normalizeStrategicCities(raw.strategicCities, stateIds),
      territorialScores: normalizeTerritorialScores(raw.territorialScores, stateIds),
      rebellions: normalizeRebellions(raw.rebellions, stateIds),
      turnCheckpoint: normalizeTurnCheckpoint(raw.turnCheckpoint)
    }
  };
}

export function migrateSceneState(raw: unknown): ValidationResult<SceneState> {
  if (isRecord(raw) && Object.hasOwn(raw, "version") && typeof raw.version !== "number") {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "version" } };
  }
  const version = versionOf(raw);
  if (version !== undefined && version > 7) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  if (!isRecord(raw)) return normalizeSceneState(raw);
  let migrated: UnknownRecord = raw;
  if (version === 0 || version === 1 || version === undefined) {
    const sides = Array.isArray(raw.sides)
      ? raw.sides.map((side) => isRecord(side) ? { ...side, leaderPlayerIds: [] } : side)
      : [];
    migrated = { ...raw, version: 2, sides };
  }
  if (migrated.version === 2) {
    const battleGroups = Array.isArray(migrated.battleGroups)
      ? migrated.battleGroups
          .filter((group): group is UnknownRecord =>
            isRecord(group) && typeof group.battleId === "string" && group.battleId.trim().length > 0
          )
          .sort((left, right) => compareOrdinal(left.battleId as string, right.battleId as string))
          .map((group, index) => ({ ...group, name: `Бой ${index + 1}` }))
      : [];
    migrated = { ...migrated, version: 3, battleGroups };
  }
  if (migrated.version === 3) {
    migrated = {
      ...migrated,
      version: 4,
      terrain: structuredClone(DEFAULT_TERRAIN),
      gridMap: { version: 1, cells: {}, revision: 0 },
      wars: [],
      turn: { ...DEFAULT_TURN_STATE }
    };
  }
  if (migrated.version === 4) {
    const sides = Array.isArray(migrated.sides)
      ? migrated.sides.map((side) => isRecord(side) ? { ...side, stateId: null } : side)
      : [];
    const gridMap = isRecord(migrated.gridMap) ? migrated.gridMap : { version: 1, cells: {}, revision: 0 };
    const cells = isRecord(gridMap.cells)
      ? Object.fromEntries(Object.entries(gridMap.cells).map(([key, cell]) => [
          key,
          isRecord(cell)
            ? { ...cell, recognizedStateId: null, deFactoStateId: null }
            : cell
        ]))
      : {};
    const wars = Array.isArray(migrated.wars)
      ? migrated.wars.map((war) => isRecord(war) ? { ...war, participantStateIds: [] } : war)
      : [];
    migrated = {
      ...migrated,
      version: 5,
      sides,
      states: [],
      gridMap: { ...gridMap, version: 1, cells },
      wars
    };
  }
  if (migrated.version === 5) {
    const turn = isRecord(migrated.turn) ? migrated.turn : DEFAULT_TURN_STATE;
    migrated = {
      ...migrated,
      version: 6,
      terrain: migrateLegacyTerrainToNavalSafe(migrated.terrain),
      turn: { ...turn, phase: "MOVEMENT" },
      ships: {},
      navalBattleRequests: [],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {}
    };
  }
  if (migrated.version === 6) {
    const rawStateIds = new Set(
      Array.isArray(migrated.states)
        ? migrated.states.flatMap((state) => isRecord(state) && nonEmptyString(state.id) ? [state.id] : [])
        : []
    );
    migrated = {
      ...migrated,
      version: 7,
      terrain: ensureBuiltInTerrains(migrated.terrain),
      stateRelations: pairwiseRelationsFromLegacyWars(migrated.wars, rawStateIds),
      foreignPresenceViolations: [],
      forcedExitStates: [],
      strategicCities: [],
      territorialScores: [],
      rebellions: [],
      turnCheckpoint: null
    };
  }
  if (migrated.version === 7) {
    migrated = { ...migrated, terrain: ensureBuiltInTerrains(migrated.terrain) };
    return normalizeStrategicSceneState(migrated);
  }
  return normalizeSceneState(migrated);
}

export function migrateArmyState(raw: unknown): ValidationResult<ArmyState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 4) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  let migrated = raw;
  if (version === 0 && isRecord(raw)) {
    migrated = {
      ...raw,
      version: 1,
      status: raw.status === "IDLE" ? "READY" : raw.status,
      overrides: isRecord(raw.overrides) ? raw.overrides : {},
      currentWaypointIndex: raw.currentWaypointIndex ?? 0,
      segmentProgressCells: raw.segmentProgressCells ?? 0,
      ignoresMovementBarriers: raw.ignoresMovementBarriers ?? false,
      ignoresVisionBarriers: raw.ignoresVisionBarriers ?? false,
      revision: raw.revision ?? 0
    };
  }
  if (isRecord(migrated) && migrated.version === 1) {
    const legacyRoute = Array.isArray(migrated.route) ? migrated.route : [];
    migrated = {
      ...migrated,
      version: 2,
      movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
      plannedRoute: {
        startCell: { x: 0, y: 0 },
        cells: [],
        totalCostUnits: 0,
        validatedRevision: 0,
        requiresReplan: legacyRoute.length > 0
      }
    };
  }
  if (isRecord(migrated) && migrated.version === 2) {
    const plannedRoute = isRecord(migrated.plannedRoute) ? migrated.plannedRoute : {};
    const legacyRoute = Array.isArray(migrated.route) ? migrated.route : [];
    const plannedCells = Array.isArray(plannedRoute.cells) ? plannedRoute.cells : [];
    migrated = {
      ...migrated,
      version: 3,
      movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
      health: { hp: 50, maxHp: 50 },
      supply: { supplied: true, checkedOnTurn: 0 },
      disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      plannedRoute: {
        ...plannedRoute,
        executeOnTurn: 0,
        requiresReplan: legacyRoute.length > 0 || plannedCells.length > 0
      }
    };
  }
  if (isRecord(migrated) && migrated.version === 3) {
    migrated = { ...migrated, version: 4, embarkedOnShipId: null };
  }
  return normalizeArmyState(migrated);
}

export function migrateShipState(raw: unknown): ValidationResult<ShipState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  return normalizeShipState(raw);
}

export function migrateBarrierState(raw: unknown): ValidationResult<BarrierState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  if (version === 0 && isRecord(raw)) {
    const blocks = typeof raw.blocks === "boolean" ? raw.blocks : true;
    return normalizeBarrierState({
      ...raw,
      version: 1,
      revision: raw.revision ?? 0,
      blocksMovement: raw.blocksMovement ?? blocks,
      blocksVision: raw.blocksVision ?? blocks
    });
  }
  return normalizeBarrierState(raw);
}