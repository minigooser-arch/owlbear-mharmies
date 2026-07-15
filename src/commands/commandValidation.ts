import type {
  ArmyCommand,
  ArmyCommandPayload,
  ArmyOverrides,
  BarrierState,
  SceneSettings,
  Side,
  Vector2
} from "../shared/types";

type UnknownRecord = Record<string, unknown>;
type CommandType = ArmyCommandPayload["type"];
type PayloadParser = (value: UnknownRecord) => ArmyCommandPayload | undefined;

export type CommandValidationResult =
  | { ok: true; command: ArmyCommand }
  | {
      ok: false;
      requestId?: string;
      reason: "INVALID_COMMAND" | "INVALID_BATTLE_NAME";
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
  return {
    id: value.id,
    name: value.name,
    color: value.color,
    playerIds,
    leaderPlayerIds
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
    if (value.detectionMode !== "INDEPENDENT" && value.detectionMode !== "MUTUAL") {
      return undefined;
    }
    result.detectionMode = value.detectionMode;
  }
  if ("visibilityRecalculationMode" in value) {
    if (
      value.visibilityRecalculationMode !== "ON_DROP" &&
      value.visibilityRecalculationMode !== "REALTIME"
    ) {
      return undefined;
    }
    result.visibilityRecalculationMode = value.visibilityRecalculationMode;
  }
  return result;
}

function parseOverrides(value: unknown): ArmyOverrides | undefined {
  if (!isRecord(value)) return undefined;
  const result: ArmyOverrides = {};
  const nonNegativeKeys = [
    "detectionRangeCells",
    "collisionRangeCells",
    "maxRouteDistanceCells"
  ] as const;
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
    !isRecord(value) ||
    value.version !== 1 ||
    !nonNegativeInteger(value.revision) ||
    typeof value.blocksMovement !== "boolean" ||
    typeof value.blocksVision !== "boolean" ||
    (value.visibility !== "GM_ONLY" && value.visibility !== "EVERYONE") ||
    !boundedString(value.color)
  ) {
    return undefined;
  }
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
  if ("version" in value) {
    if (value.version !== 1) return undefined;
    result.version = 1;
  }
  if ("revision" in value) {
    if (!nonNegativeInteger(value.revision)) return undefined;
    result.revision = value.revision;
  }
  if ("blocksMovement" in value) {
    if (typeof value.blocksMovement !== "boolean") return undefined;
    result.blocksMovement = value.blocksMovement;
  }
  if ("blocksVision" in value) {
    if (typeof value.blocksVision !== "boolean") return undefined;
    result.blocksVision = value.blocksVision;
  }
  if ("visibility" in value) {
    if (value.visibility !== "GM_ONLY" && value.visibility !== "EVERYONE") return undefined;
    result.visibility = value.visibility;
  }
  if ("color" in value) {
    if (!boundedString(value.color)) return undefined;
    result.color = value.color;
  }
  return result;
}

const armyIdOnly = (value: UnknownRecord): string | undefined =>
  boundedString(value.armyId) ? value.armyId : undefined;
const sidePlayer = (
  value: UnknownRecord
): { sideId: string; playerId: string } | undefined =>
  sideId(value.sideId) && boundedString(value.playerId)
    ? { sideId: value.sideId, playerId: value.playerId }
    : undefined;

const PAYLOAD_PARSERS: Record<CommandType, PayloadParser> = {
  REGISTER_ARMY: (value) =>
    boundedString(value.itemId) && sideId(value.sideId)
      ? { type: "REGISTER_ARMY", itemId: value.itemId, sideId: value.sideId }
      : undefined,
  UNREGISTER_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "UNREGISTER_ARMY", armyId } : undefined;
  },
  CREATE_SIDE: (value) => {
    const side = parseSide(value.side);
    return side ? { type: "CREATE_SIDE", side } : undefined;
  },
  RENAME_SIDE: (value) =>
    sideId(value.sideId) && boundedString(value.name)
      ? { type: "RENAME_SIDE", sideId: value.sideId, name: value.name }
      : undefined,
  DELETE_SIDE: (value) => {
    if (!sideId(value.sideId)) return undefined;
    if (value.strategy === "UNREGISTER_ARMIES") {
      return { type: "DELETE_SIDE", sideId: value.sideId, strategy: value.strategy };
    }
    if (value.strategy === "REASSIGN_ARMIES" && sideId(value.targetSideId)) {
      return {
        type: "DELETE_SIDE",
        sideId: value.sideId,
        strategy: value.strategy,
        targetSideId: value.targetSideId
      };
    }
    return undefined;
  },
  ADD_SIDE_PLAYER: (value) => {
    const parsed = sidePlayer(value);
    return parsed ? { type: "ADD_SIDE_PLAYER", ...parsed } : undefined;
  },
  REMOVE_SIDE_PLAYER: (value) => {
    const parsed = sidePlayer(value);
    return parsed ? { type: "REMOVE_SIDE_PLAYER", ...parsed } : undefined;
  },
  ADD_SIDE_LEADER: (value) => {
    const parsed = sidePlayer(value);
    return parsed ? { type: "ADD_SIDE_LEADER", ...parsed } : undefined;
  },
  REMOVE_SIDE_LEADER: (value) => {
    const parsed = sidePlayer(value);
    return parsed ? { type: "REMOVE_SIDE_LEADER", ...parsed } : undefined;
  },
  SET_RELATION: (value) =>
    sideId(value.leftSideId) &&
    sideId(value.rightSideId) &&
    (value.relation === "ALLY" || value.relation === "NEUTRAL" || value.relation === "ENEMY")
      ? {
          type: "SET_RELATION",
          leftSideId: value.leftSideId,
          rightSideId: value.rightSideId,
          relation: value.relation
        }
      : undefined,
  UPDATE_SETTINGS: (value) => {
    const settings = parseSettings(value.settings);
    return settings ? { type: "UPDATE_SETTINGS", settings } : undefined;
  },
  UPDATE_ARMY_OVERRIDES: (value) => {
    const overrides = parseOverrides(value.overrides);
    return boundedString(value.armyId) && overrides
      ? { type: "UPDATE_ARMY_OVERRIDES", armyId: value.armyId, overrides }
      : undefined;
  },
  SET_ROUTE: (value) => {
    const route = parseRoute(value.route);
    return boundedString(value.armyId) && route
      ? { type: "SET_ROUTE", armyId: value.armyId, route }
      : undefined;
  },
  CLEAR_ROUTE: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "CLEAR_ROUTE", armyId } : undefined;
  },
  MOVE_ARMY: (value) => {
    const position = parseVector(value.position);
    return boundedString(value.armyId) && position
      ? { type: "MOVE_ARMY", armyId: value.armyId, position }
      : undefined;
  },
  START_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "START_ARMY", armyId } : undefined;
  },
  PAUSE_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "PAUSE_ARMY", armyId } : undefined;
  },
  RESUME_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "RESUME_ARMY", armyId } : undefined;
  },
  STOP_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "STOP_ARMY", armyId } : undefined;
  },
  START_ALL: () => ({ type: "START_ALL" }),
  PAUSE_ALL: () => ({ type: "PAUSE_ALL" }),
  RESUME_ALL: () => ({ type: "RESUME_ALL" }),
  STOP_ALL: () => ({ type: "STOP_ALL" }),
  CREATE_BARRIER: (value) => {
    const barrier = parseBarrier(value.barrier);
    return boundedString(value.itemId) && barrier
      ? { type: "CREATE_BARRIER", itemId: value.itemId, barrier }
      : undefined;
  },
  UPDATE_BARRIER: (value) => {
    const barrier = parseBarrierPatch(value.barrier);
    return boundedString(value.itemId) && barrier
      ? { type: "UPDATE_BARRIER", itemId: value.itemId, barrier }
      : undefined;
  },
  DELETE_BARRIER: (value) =>
    boundedString(value.itemId)
      ? { type: "DELETE_BARRIER", itemId: value.itemId }
      : undefined,
  RENAME_BATTLE_GROUP: (value) => {
    const name = battleName(value.name);
    return boundedString(value.battleId) && name
      ? { type: "RENAME_BATTLE_GROUP", battleId: value.battleId, name }
      : undefined;
  },
  RELEASE_BATTLE_GROUP: (value) =>
    boundedString(value.battleId)
      ? { type: "RELEASE_BATTLE_GROUP", battleId: value.battleId }
      : undefined,
  REMOVE_BATTLE_PARTICIPANT: (value) =>
    boundedString(value.battleId) && boundedString(value.armyId)
      ? {
          type: "REMOVE_BATTLE_PARTICIPANT",
          battleId: value.battleId,
          armyId: value.armyId
        }
      : undefined
};

function invalid(
  requestId?: string,
  reason: "INVALID_COMMAND" | "INVALID_BATTLE_NAME" = "INVALID_COMMAND"
): CommandValidationResult {
  return {
    ok: false,
    ...(requestId ? { requestId } : {}),
    reason
  };
}

export function validateArmyCommand(value: unknown): CommandValidationResult {
  if (!isRecord(value)) return invalid();
  const requestId = boundedString(value.requestId, 128) ? value.requestId : undefined;
  if (
    !requestId ||
    !boundedString(value.senderPlayerId) ||
    !boundedString(value.senderConnectionId) ||
    !nonNegativeInteger(value.expectedRevision) ||
    !boundedString(value.type) ||
    !Object.hasOwn(PAYLOAD_PARSERS, value.type)
  ) {
    return invalid(requestId);
  }
  const parser = PAYLOAD_PARSERS[value.type as CommandType];
  const payload = parser(value);
  if (!payload) {
    return invalid(
      requestId,
      value.type === "RENAME_BATTLE_GROUP" && battleName(value.name) === undefined
        ? "INVALID_BATTLE_NAME"
        : "INVALID_COMMAND"
    );
  }
  return {
    ok: true,
    command: {
      requestId,
      senderPlayerId: value.senderPlayerId,
      senderConnectionId: value.senderConnectionId,
      expectedRevision: value.expectedRevision,
      ...payload
    }
  };
}
