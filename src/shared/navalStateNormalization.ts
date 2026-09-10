import type { SceneState, ShipFacing, ShipState, ValidationResult } from "./types";
import {
  normalizeSceneState as normalizeBaseSceneState,
  normalizeShipState as normalizeBaseShipState
} from "./validation";

type UnknownRecord = Record<string, unknown>;
const FACINGS: readonly ShipFacing[] = ["NORTH", "EAST", "SOUTH", "WEST"];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlannedFacing(value: unknown): ShipFacing | null {
  return typeof value === "string" && FACINGS.includes(value as ShipFacing)
    ? value as ShipFacing
    : null;
}

function attachPlannedFacing(ship: ShipState, raw: unknown): ShipState {
  return {
    ...ship,
    plannedFacing: isRecord(raw) ? normalizePlannedFacing(raw.plannedFacing) : null
  };
}

export function normalizeShipStateWithPlannedFacing(raw: unknown): ValidationResult<ShipState> {
  const result = normalizeBaseShipState(raw);
  return result.ok
    ? { ok: true, value: attachPlannedFacing(result.value, raw) }
    : result;
}

export function normalizeSceneStateWithPlannedFacing(raw: unknown): ValidationResult<SceneState> {
  const result = normalizeBaseSceneState(raw);
  if (!result.ok) return result;

  const rawShips = isRecord(raw) && isRecord(raw.ships) ? raw.ships : {};
  const normalizedShips = result.value.ships ?? {};
  result.value.ships = Object.fromEntries(
    Object.entries(normalizedShips).map(([shipId, ship]) => [
      shipId,
      attachPlannedFacing(ship, rawShips[shipId])
    ])
  );
  return result;
}
