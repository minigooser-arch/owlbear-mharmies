import type {
  ArmyState,
  BarrierState,
  SceneState,
  ShipState,
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

export function migrateSceneState(raw: unknown): ValidationResult<SceneState> {
  if (isRecord(raw) && Object.hasOwn(raw, "version") && typeof raw.version !== "number") {
    return { ok: false, issue: { code: "INVALID_VALUE", path: "version" } };
  }
  const version = versionOf(raw);
  if (version !== undefined && version > 6) {
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
