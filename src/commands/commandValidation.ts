import type {
  ArmyCommand,
  ArmyCommandPayload,
  ArmyOverrides,
  BarrierState,
  GridCellCoord,
  SceneSettings,
  Side,
  StateEntity,
  TerrainType,
  Vector2,
  WarState
} from "../shared/types";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";

type UnknownRecord = Record<string, unknown>;
type CommandType = ArmyCommandPayload["type"];
type PayloadParser = (value: UnknownRecord) => ArmyCommandPayload | undefined;

export type CommandValidationResult =
  | { ok: true; command: ArmyCommand }
  | {
      ok: false;
      requestId?: string;
      reason: "INVALID_COMMAND" | "INVALID_BATTLE_NAME" | "PROTOCOL_MISMATCH";
    };

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function battleName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const length = [...trimmed].length;
  return length >= 1 && length <= 80 ? trimmed : undefined;
}

const RESERVED_RECORD_KEYS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  "prototype"
]);

function sideId(value: unknown): value is string {
  return boundedString(value) && !RESERVED_RECORD_KEYS.has(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function finiteAtLeast(value: unknown, minimum: number, inclusive = true): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (inclusive ? value >= minimum : value > minimum)
  );
}

function denseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!denseArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (!boundedString(entry)) return undefined;
    result.push(entry);
  }
  if (new Set(result).size !== result.length) return undefined;
  return result;
}

function parseVector(value: unknown): Vector2 | undefined {
  if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined;
  return { x: value.x as number, y: value.y as number };
}

function parseRoute(value: unknown): Vector2[] | undefined {
  if (!denseArray(value) || value.length > 256) return undefined;
  const route: Vector2[] = [];
  for (const point of value) {
    const parsed = parseVector(point);
    if (!parsed) return undefined;
    route.push(parsed);
  }
  return route;
}

function parseGridCell(value: unknown): GridCellCoord | undefined {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return undefined;
  return { x: value.x as number, y: value.y as number };
}

function parseCells(value: unknown): GridCellCoord[] | undefined {
  if (!denseArray(value) || value.length > 4096) return undefined;
  const cells: GridCellCoord[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const cell = parseGridCell(entry);
    if (!cell) return undefined;
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(cell);
  }
  return cells;
}

function parseOrderedCells(value: unknown): GridCellCoord[] | undefined {
  if (!denseArray(value) || value.length === 0 || value.length > 256) return undefined;
  const cells: GridCellCoord[] = [];
  for (const entry of value) {
    const cell = parseGridCell(entry);
    if (!cell) return undefined;
    cells.push(cell);
  }
  return cells;
}

function parseTerrainType(value: unknown): TerrainType | undefined {
  if (!isRecord(value) || !sideId(value.id) || !boundedString(value.name, 80) ||
      !Number.isInteger(value.movementCostUnits) || (value.movementCostUnits as number) <= 0 ||
      typeof value.enabled !== "boolean") return undefined;
  const terrain: TerrainType = {
    id: value.id,
    name: value.name.trim(),
    movementCostUnits: value.movementCostUnits as number,
    enabled: value.enabled
  };
  if (value.color !== undefined) {
    if (!boundedString(value.color, 32)) return undefined;
    terrain.color = value.color;
  }
  return terrain;
}

function parseStateEntity(value: unknown): StateEntity | undefined {
  if (!isRecord(value) || !sideId(value.id) || !boundedString(value.name, 80) || typeof value.active !== "boolean") return undefined;
  const rulingFactionId = value.rulingFactionId === null || value.rulingFactionId === undefined
    ? null
    : sideId(value.rulingFactionId) ? value.rulingFactionId : undefined;
  if (rulingFactionId === undefined) return undefined;
  return { id: value.id, name: value.name.trim(), rulingFactionId, active: value.active };
}

function parseWar(value: unknown): WarState | undefined {
  if (!isRecord(value) || !sideId(value.id) || !boundedString(value.name, 80) || typeof value.active !== "boolean") return undefined;
  const participantFactionIds = parseStringArray(value.participantFactionIds);
  const participantStateIds = value.participantStateIds === undefined
    ? []
    : parseStringArray(value.participantStateIds);
  if (!participantFactionIds || !participantStateIds) return undefined;
  if (participantFactionIds.length < 2 && participantStateIds.length < 2) return undefined;
  return { id: value.id, name: value.name.trim(), participantFactionIds, participantStateIds, active: value.active };
}

function parseSide(value: unknown): Side | undefined {
  if (
    !isRecord(value) ||
    !sideId(value.id) ||
    !boundedString(value.name) ||
    !boundedString(value.color)
  ) {
    return undefined;
  }
  const playerIds = parseStringArray(value.playerIds);
  const leaderPlayerIds = parseStringArray(value.leaderPlayerIds);
  if (!playerIds || !leaderPlayerIds) return undefined;
  const members = new Set(playerIds);
  if (leaderPlayerIds.some((leaderId) => !members.has(leaderId))) return undefined;
  const parsedStateId = value.stateId === undefined || value.stateId === null
    ? null
    : sideId(value.stateId) ? value.stateId : undefined;
  if (parsedStateId === undefined) return undefined;
  return {
    id: value.id,
    name: value.name,
    color: value.color,
    playerIds,
    leaderPlayerIds,
    stateId: parsedStateId
  };
}

function parseSettings(value: unknown): Partial<SceneSettings> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<SceneSettings> = {};
  const nonNegativeKeys = [
    "defaultDetectionRangeCells",
    "defaultCollisionRangeCells",
    "defaultMaxRouteDistanceCells"
  ] as const;
  const positiveKeys = [
    "defaultSpeedCellsPerSecond",
    "movementUpdateRate",
    "visibilityUpdateRate"
  ] as const;
  const booleanKeys = [
    "allowPlayersToCreateRoutes",
    "allowPlayersToStartOwnArmies",
    "interpolationEnabled"
  ] as const;

  for (const key of nonNegativeKeys) {
    if (!(key in value)) continue;
    if (!finiteAtLeast(value[key], 0)) return undefined;
    result[key] = value[key];
  }
  for (const key of positiveKeys) {
    if (!(key in value)) continue;
    if (!finiteAtLeast(value[key], 0, false)) return undefined;
    result[key] = value[key];
  }
  for (const key of booleanKeys) {
    if (!(key in value)) continue;
    if (typeof value[key] !== "boolean") return undefined;
    result[key] = value[key];
  }
  if ("detectionMode" in value) {
    if (value.detectionMode !== "INDEPENDENT" && value.detectionMode !== "MUTUAL") return undefined;
    result.detectionMode = value.detectionMode;
  }
  if ("visibilityRecalculationMode" in value) {
    if (value.visibilityRecalculationMode !== "ON_DROP" && value.visibilityRecalculationMode !== "REALTIME") return undefined;
    result.visibilityRecalculationMode = value.visibilityRecalculationMode;
  }
  return result;
}

function parseOverrides(value: unknown): ArmyOverrides | undefined {
  if (!isRecord(value)) return undefined;
  const result: ArmyOverrides = {};
  const nonNegativeKeys = ["detectionRangeCells", "collisionRangeCells", "maxRouteDistanceCells"] as const;
  for (const key of nonNegativeKeys) {
    if (!(key in value)) continue;
    if (!finiteAtLeast(value[key], 0)) return undefined;
    result[key] = value[key];
  }
  if ("speedCellsPerSecond" in value) {
    if (!finiteAtLeast(value.speedCellsPerSecond, 0, false)) return undefined;
    result.speedCellsPerSecond = value.speedCellsPerSecond;
  }
  return result;
}

function parseBarrier(value: unknown): BarrierState | undefined {
  if (
    !isRecord(value) || value.version !== 1 || !nonNegativeInteger(value.revision) ||
    typeof value.blocksMovement !== "boolean" || typeof value.blocksVision !== "boolean" ||
    (value.visibility !== "GM_ONLY" && value.visibility !== "EVERYONE") || !boundedString(value.color)
  ) return undefined;
  return {
    version: 1,
    revision: value.revision,
    blocksMovement: value.blocksMovement,
    blocksVision: value.blocksVision,
    visibility: value.visibility,
    color: value.color
  };
}

function parseBarrierPatch(value: unknown): Partial<BarrierState> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<BarrierState> = {};
  if ("version" in value) { if (value.version !== 1) return undefined; result.version = 1; }
  if ("revision" in value) { if (!nonNegativeInteger(value.revision)) return undefined; result.revision = value.revision; }
  if ("blocksMovement" in value) { if (typeof value.blocksMovement !== "boolean") return undefined; result.blocksMovement = value.blocksMovement; }
  if ("blocksVision" in value) { if (typeof value.blocksVision !== "boolean") return undefined; result.blocksVision = value.blocksVision; }
  if ("visibility" in value) { if (value.visibility !== "GM_ONLY" && value.visibility !== "EVERYONE") return undefined; result.visibility = value.visibility; }
  if ("color" in value) { if (!boundedString(value.color)) return undefined; result.color = value.color; }
  return result;
}

const armyIdOnly = (value: UnknownRecord): string | undefined => boundedString(value.armyId) ? value.armyId : undefined;
const sidePlayer = (value: UnknownRecord): { sideId: string; playerId: string } | undefined =>
  sideId(value.sideId) && boundedString(value.playerId) ? { sideId: value.sideId, playerId: value.playerId } : undefined;

const PAYLOAD_PARSERS: Record<CommandType, PayloadParser> = {
  REGISTER_ARMY: (value) => boundedString(value.itemId) && sideId(value.sideId)
    ? { type: "REGISTER_ARMY", itemId: value.itemId, sideId: value.sideId } : undefined,
  UNREGISTER_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "UNREGISTER_ARMY", armyId } : undefined;
  },
  REGISTER_SHIP: (value) =>
    boundedString(value.itemId) && sideId(value.sideId) &&
    (value.classId === "BATTLESHIP" || value.classId === "CRUISER" || value.classId === "IRONCLAD" || value.classId === "HOSPITAL" || value.classId === "TRANSPORT") &&
    (value.facing === "NORTH" || value.facing === "EAST" || value.facing === "SOUTH" || value.facing === "WEST")
      ? { type: "REGISTER_SHIP", itemId: value.itemId, sideId: value.sideId, classId: value.classId, facing: value.facing }
      : undefined,
  UNREGISTER_SHIP: (value) => boundedString(value.shipId) ? { type: "UNREGISTER_SHIP", shipId: value.shipId } : undefined,
  SET_SHIP_ROUTE: (value) => {
    const startCell = parseGridCell(value.startCell);
    const cells = parseOrderedCells(value.cells);
    return boundedString(value.shipId) && startCell && cells
      ? { type: "SET_SHIP_ROUTE", shipId: value.shipId, startCell, cells }
      : undefined;
  },
  SET_SHIP_HP: (value) =>
    boundedString(value.shipId) && nonNegativeInteger(value.hp)
      ? { type: "SET_SHIP_HP", shipId: value.shipId, hp: value.hp }
      : undefined,
  SET_SHIP_DETECTION_OVERRIDE: (value) =>
    boundedString(value.shipId) &&
    (value.detectionOverride === null || finiteAtLeast(value.detectionOverride, 0))
      ? { type: "SET_SHIP_DETECTION_OVERRIDE", shipId: value.shipId, detectionOverride: value.detectionOverride as number | null }
      : undefined,
  NAVAL_MOVE_FORWARD: (value) => boundedString(value.shipId)
    ? { type: "NAVAL_MOVE_FORWARD", shipId: value.shipId }
    : undefined,
  NAVAL_TURN_SHIP: (value) => boundedString(value.shipId) && (value.direction === "LEFT" || value.direction === "RIGHT")
    ? { type: "NAVAL_TURN_SHIP", shipId: value.shipId, direction: value.direction }
    : undefined,
  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)
    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }
    : undefined,
  START_NAVAL_BATTLE: (value) => {
    const participantShipIds = parseStringArray(value.participantShipIds);
    const areaCells = parseCells(value.areaCells);
    const navalRequestId = value.navalRequestId === null
      ? null
      : boundedString(value.navalRequestId) ? value.navalRequestId : undefined;
    return boundedString(value.battleId) && boundedString(value.initiatingShipId) &&
      participantShipIds && participantShipIds.length > 0 &&
      areaCells && areaCells.length > 0 && navalRequestId !== undefined
        ? {
            type: "START_NAVAL_BATTLE",
            battleId: value.battleId,
            navalRequestId,
            initiatingShipId: value.initiatingShipId,
            participantShipIds,
            areaCells
          }
        : undefined;
  },
  COMPLETE_NAVAL_BATTLE: () => ({ type: "COMPLETE_NAVAL_BATTLE" }),
  CREATE_SIDE: (value) => {
    const side = parseSide(value.side);
    return side ? { type: "CREATE_SIDE", side } : undefined;
  },
  RENAME_SIDE: (value) => sideId(value.sideId) && boundedString(value.name)
    ? { type: "RENAME_SIDE", sideId: value.sideId, name: value.name } : undefined,
  DELETE_SIDE: (value) => {
    if (!sideId(value.sideId)) return undefined;
    if (value.strategy === "UNREGISTER_ARMIES") return { type: "DELETE_SIDE", sideId: value.sideId, strategy: value.strategy };
    if (value.strategy === "REASSIGN_ARMIES" && sideId(value.targetSideId)) {
      return { type: "DELETE_SIDE", sideId: value.sideId, strategy: value.strategy, targetSideId: value.targetSideId };
    }
    return undefined;
  },
  ADD_SIDE_PLAYER: (value) => { const parsed = sidePlayer(value); return parsed ? { type: "ADD_SIDE_PLAYER", ...parsed } : undefined; },
  REMOVE_SIDE_PLAYER: (value) => { const parsed = sidePlayer(value); return parsed ? { type: "REMOVE_SIDE_PLAYER", ...parsed } : undefined; },
  ADD_SIDE_LEADER: (value) => { const parsed = sidePlayer(value); return parsed ? { type: "ADD_SIDE_LEADER", ...parsed } : undefined; },
  REMOVE_SIDE_LEADER: (value) => { const parsed = sidePlayer(value); return parsed ? { type: "REMOVE_SIDE_LEADER", ...parsed } : undefined; },
  SET_RELATION: (value) => sideId(value.leftSideId) && sideId(value.rightSideId) &&
    (value.relation === "ALLY" || value.relation === "NEUTRAL" || value.relation === "ENEMY")
      ? { type: "SET_RELATION", leftSideId: value.leftSideId, rightSideId: value.rightSideId, relation: value.relation }
      : undefined,
  UPDATE_SETTINGS: (value) => { const settings = parseSettings(value.settings); return settings ? { type: "UPDATE_SETTINGS", settings } : undefined; },
  UPDATE_ARMY_OVERRIDES: (value) => {
    const overrides = parseOverrides(value.overrides);
    return boundedString(value.armyId) && overrides ? { type: "UPDATE_ARMY_OVERRIDES", armyId: value.armyId, overrides } : undefined;
  },
  SET_ROUTE: (value) => {
    const route = parseRoute(value.route);
    const startCell = parseGridCell(value.startCell);
    const cells = parseCells(value.cells);
    return boundedString(value.armyId) && route && startCell && cells && route.length === cells.length
      ? { type: "SET_ROUTE", armyId: value.armyId, route, startCell, cells } : undefined;
  },
  CLEAR_ROUTE: (value) => { const armyId = armyIdOnly(value); return armyId ? { type: "CLEAR_ROUTE", armyId } : undefined; },
  MOVE_ARMY: (value) => { const position = parseVector(value.position); return boundedString(value.armyId) && position ? { type: "MOVE_ARMY", armyId: value.armyId, position } : undefined; },
  START_ARMY: (value) => { const armyId = armyIdOnly(value); return armyId ? { type: "START_ARMY", armyId } : undefined; },
  PAUSE_ARMY: (value) => { const armyId = armyIdOnly(value); return armyId ? { type: "PAUSE_ARMY", armyId } : undefined; },
  RESUME_ARMY: (value) => { const armyId = armyIdOnly(value); return armyId ? { type: "RESUME_ARMY", armyId } : undefined; },
  STOP_ARMY: (value) => { const armyId = armyIdOnly(value); return armyId ? { type: "STOP_ARMY", armyId } : undefined; },
  START_ALL: () => ({ type: "START_ALL" }),
  PAUSE_ALL: () => ({ type: "PAUSE_ALL" }),
  RESUME_ALL: () => ({ type: "RESUME_ALL" }),
  STOP_ALL: () => ({ type: "STOP_ALL" }),
  CREATE_BARRIER: (value) => { const barrier = parseBarrier(value.barrier); return boundedString(value.itemId) && barrier ? { type: "CREATE_BARRIER", itemId: value.itemId, barrier } : undefined; },
  UPDATE_BARRIER: (value) => { const barrier = parseBarrierPatch(value.barrier); return boundedString(value.itemId) && barrier ? { type: "UPDATE_BARRIER", itemId: value.itemId, barrier } : undefined; },
  DELETE_BARRIER: (value) => boundedString(value.itemId) ? { type: "DELETE_BARRIER", itemId: value.itemId } : undefined,
  RENAME_BATTLE_GROUP: (value) => { const name = battleName(value.name); return boundedString(value.battleId) && name ? { type: "RENAME_BATTLE_GROUP", battleId: value.battleId, name } : undefined; },
  RELEASE_BATTLE_GROUP: (value) => boundedString(value.battleId) ? { type: "RELEASE_BATTLE_GROUP", battleId: value.battleId } : undefined,
  REMOVE_BATTLE_PARTICIPANT: (value) => boundedString(value.battleId) && boundedString(value.armyId)
    ? { type: "REMOVE_BATTLE_PARTICIPANT", battleId: value.battleId, armyId: value.armyId } : undefined,
  SET_TERRAIN_CELLS: (value) => { const cells = parseCells(value.cells); return cells && (value.terrainId === null || sideId(value.terrainId)) ? { type: "SET_TERRAIN_CELLS", cells, terrainId: value.terrainId as string | null } : undefined; },
  SET_IMPASSABLE_CELLS: (value) => { const cells = parseCells(value.cells); return cells && typeof value.impassable === "boolean" ? { type: "SET_IMPASSABLE_CELLS", cells, impassable: value.impassable } : undefined; },
  UPDATE_FACTION_TERRITORY_CELLS: (value) => {
    const cells = parseCells(value.cells);
    return cells && sideId(value.sideId) && (value.operation === "ADD" || value.operation === "REMOVE")
      ? { type: "UPDATE_FACTION_TERRITORY_CELLS", cells, sideId: value.sideId, operation: value.operation } : undefined;
  },
  CLEAR_CELL_PROPERTIES: (value) => {
    const cells = parseCells(value.cells);
    const target = value.target === "TERRAIN" || value.target === "IMPASSABLE" || value.target === "SELECTED_FACTION" || value.target === "RECOGNIZED_STATE" || value.target === "DEFACTO_STATE" || value.target === "ALL" ? value.target : undefined;
    if (!cells || !target) return undefined;
    if (target === "SELECTED_FACTION") return sideId(value.sideId) ? { type: "CLEAR_CELL_PROPERTIES", cells, target, sideId: value.sideId } : undefined;
    return { type: "CLEAR_CELL_PROPERTIES", cells, target };
  },
  CREATE_TERRAIN_TYPE: (value) => { const terrain = parseTerrainType(value.terrain); return terrain ? { type: "CREATE_TERRAIN_TYPE", terrain } : undefined; },
  UPDATE_TERRAIN_TYPE: (value) => {
    if (!sideId(value.terrainId) || !isRecord(value.patch)) return undefined;
    const patch: Partial<Omit<TerrainType, "id">> = {};
    if ("name" in value.patch) { if (!boundedString(value.patch.name, 80)) return undefined; patch.name = value.patch.name.trim(); }
    if ("movementCostUnits" in value.patch) { if (!Number.isInteger(value.patch.movementCostUnits) || (value.patch.movementCostUnits as number) <= 0) return undefined; patch.movementCostUnits = value.patch.movementCostUnits as number; }
    if ("enabled" in value.patch) { if (typeof value.patch.enabled !== "boolean") return undefined; patch.enabled = value.patch.enabled; }
    if ("color" in value.patch) { if (!boundedString(value.patch.color, 32)) return undefined; patch.color = value.patch.color; }
    return { type: "UPDATE_TERRAIN_TYPE", terrainId: value.terrainId, patch };
  },
  DELETE_TERRAIN_TYPE: (value) => sideId(value.terrainId) && (value.replacementTerrainId === undefined || sideId(value.replacementTerrainId))
    ? { type: "DELETE_TERRAIN_TYPE", terrainId: value.terrainId, ...(value.replacementTerrainId ? { replacementTerrainId: value.replacementTerrainId } : {}) } : undefined,
  CREATE_STATE: (value) => { const state = parseStateEntity(value.state); return state ? { type: "CREATE_STATE", state } : undefined; },
  UPDATE_STATE: (value) => {
    if (!sideId(value.stateId) || !isRecord(value.patch)) return undefined;
    const patch: Partial<Omit<StateEntity, "id">> = {};
    if ("name" in value.patch) { if (!boundedString(value.patch.name, 80)) return undefined; patch.name = value.patch.name.trim(); }
    if ("active" in value.patch) { if (typeof value.patch.active !== "boolean") return undefined; patch.active = value.patch.active; }
    if ("rulingFactionId" in value.patch) { if (value.patch.rulingFactionId !== null && !sideId(value.patch.rulingFactionId)) return undefined; patch.rulingFactionId = value.patch.rulingFactionId as string | null; }
    return { type: "UPDATE_STATE", stateId: value.stateId, patch };
  },
  DELETE_STATE: (value) => sideId(value.stateId) ? { type: "DELETE_STATE", stateId: value.stateId } : undefined,
  SET_SIDE_STATE: (value) => sideId(value.sideId) && (value.stateId === null || sideId(value.stateId)) ? { type: "SET_SIDE_STATE", sideId: value.sideId, stateId: value.stateId as string | null } : undefined,
  SET_RECOGNIZED_STATE_CELLS: (value) => { const cells = parseCells(value.cells); return cells && (value.stateId === null || sideId(value.stateId)) ? { type: "SET_RECOGNIZED_STATE_CELLS", cells, stateId: value.stateId as string | null } : undefined; },
  SET_DEFACTO_STATE_CELLS: (value) => { const cells = parseCells(value.cells); return cells && (value.stateId === null || sideId(value.stateId)) ? { type: "SET_DEFACTO_STATE_CELLS", cells, stateId: value.stateId as string | null } : undefined; },
  SET_ARMY_HP: (value) => {
    if (!boundedString(value.armyId) || !nonNegativeInteger(value.hp)) return undefined;
    if (value.maxHp !== undefined && (!nonNegativeInteger(value.maxHp) || value.maxHp <= 0)) return undefined;
    return { type: "SET_ARMY_HP", armyId: value.armyId, hp: value.hp, ...(value.maxHp !== undefined ? { maxHp: value.maxHp } : {}) };
  },
  HEAL_ARMY: (value) => boundedString(value.armyId) && nonNegativeInteger(value.amount) && value.amount > 0 ? { type: "HEAL_ARMY", armyId: value.armyId, amount: value.amount } : undefined,
  REQUEST_ARMY_DISBAND: (value) => { const armyId = armyIdOnly(value); return armyId ? { type: "REQUEST_ARMY_DISBAND", armyId } : undefined; },
  CREATE_WAR: (value) => { const war = parseWar(value.war); return war ? { type: "CREATE_WAR", war } : undefined; },
  UPDATE_WAR: (value) => {
    if (!sideId(value.warId) || !isRecord(value.patch)) return undefined;
    const patch: Partial<Omit<WarState, "id">> = {};
    if ("name" in value.patch) { if (!boundedString(value.patch.name, 80)) return undefined; patch.name = value.patch.name.trim(); }
    if ("active" in value.patch) { if (typeof value.patch.active !== "boolean") return undefined; patch.active = value.patch.active; }
    if ("participantFactionIds" in value.patch) { const ids = parseStringArray(value.patch.participantFactionIds); if (!ids) return undefined; patch.participantFactionIds = ids; }
    if ("participantStateIds" in value.patch) { const ids = parseStringArray(value.patch.participantStateIds); if (!ids) return undefined; patch.participantStateIds = ids; }
    const nextFactionCount = patch.participantFactionIds?.length;
    const nextStateCount = patch.participantStateIds?.length;
    if (nextFactionCount !== undefined && nextStateCount !== undefined && nextFactionCount < 2 && nextStateCount < 2) return undefined;
    return { type: "UPDATE_WAR", warId: value.warId, patch };
  },
  END_WAR: (value) => sideId(value.warId) ? { type: "END_WAR", warId: value.warId } : undefined,
  DEFER_TURN: (value) => {
    if (!boundedString(value.until, 64) || !Number.isFinite(Date.parse(value.until))) return undefined;
    return { type: "DEFER_TURN", until: new Date(value.until).toISOString() };
  },
  CANCEL_TURN_DEFERRAL: () => ({ type: "CANCEL_TURN_DEFERRAL" }),
  PAUSE_AUTO_TURNS: () => ({ type: "PAUSE_AUTO_TURNS" }),
  RESUME_AUTO_TURNS: () => ({ type: "RESUME_AUTO_TURNS" }),
  COMPLETE_TURN_NOW: () => ({ type: "COMPLETE_TURN_NOW" })
};

function invalid(requestId?: string, reason: "INVALID_COMMAND" | "INVALID_BATTLE_NAME" | "PROTOCOL_MISMATCH" = "INVALID_COMMAND"): CommandValidationResult {
  return { ok: false, ...(requestId ? { requestId } : {}), reason };
}

export function validateArmyCommand(value: unknown): CommandValidationResult {
  if (!isRecord(value)) return invalid();
  const requestId = boundedString(value.requestId, 128) ? value.requestId : undefined;
  if (value.protocolVersion !== COMMAND_PROTOCOL_VERSION) return invalid(requestId, "PROTOCOL_MISMATCH");
  if (!requestId || !boundedString(value.senderPlayerId) || !boundedString(value.senderConnectionId) || !nonNegativeInteger(value.expectedRevision) || !boundedString(value.type) || !Object.hasOwn(PAYLOAD_PARSERS, value.type)) {
    return invalid(requestId);
  }
  const parser = PAYLOAD_PARSERS[value.type as CommandType];
  const payload = parser(value);
  if (!payload) {
    return invalid(requestId, value.type === "RENAME_BATTLE_GROUP" && battleName(value.name) === undefined ? "INVALID_BATTLE_NAME" : "INVALID_COMMAND");
  }
  return {
    ok: true,
    command: {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId,
      senderPlayerId: value.senderPlayerId,
      senderConnectionId: value.senderConnectionId,
      expectedRevision: value.expectedRevision,
      ...payload
    }
  };
}
