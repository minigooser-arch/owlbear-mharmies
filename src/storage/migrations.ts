import type {
  ArmyState,
  BarrierState,
  SceneState,
  ValidationResult
} from "../shared/types";
import {
  normalizeArmyState,
  normalizeBarrierState,
  normalizeSceneState
} from "../shared/validation";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function versionOf(raw: unknown): number | undefined {
  return isRecord(raw) && typeof raw.version === "number" ? raw.version : undefined;
}

export function migrateSceneState(raw: unknown): ValidationResult<SceneState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 2) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  if (!isRecord(raw)) return normalizeSceneState(raw);
  if (version === 0 || version === 1 || version === undefined) {
    const sides = Array.isArray(raw.sides)
      ? raw.sides.map((side) =>
          isRecord(side) ? { ...side, leaderPlayerIds: [] } : side
        )
      : [];
    return normalizeSceneState({ ...raw, version: 2, sides });
  }
  return normalizeSceneState(raw);
}

export function migrateArmyState(raw: unknown): ValidationResult<ArmyState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  if (version === 0 && isRecord(raw)) {
    return normalizeArmyState({
      ...raw,
      version: 1,
      status: raw.status === "IDLE" ? "READY" : raw.status,
      overrides: isRecord(raw.overrides) ? raw.overrides : {},
      currentWaypointIndex: raw.currentWaypointIndex ?? 0,
      segmentProgressCells: raw.segmentProgressCells ?? 0,
      ignoresMovementBarriers: raw.ignoresMovementBarriers ?? false,
      ignoresVisionBarriers: raw.ignoresVisionBarriers ?? false,
      revision: raw.revision ?? 0
    });
  }
  return normalizeArmyState(raw);
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
