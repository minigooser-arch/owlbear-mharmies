import type { CommandEnvelope, GridCellCoord, StrategicCity } from "../shared/types";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";

export type StrategicCityCommandPayload =
  | { type: "CREATE_STRATEGIC_CITY"; city: StrategicCity }
  | { type: "UPDATE_STRATEGIC_CITY"; cityId: string; patch: Partial<Omit<StrategicCity, "id">> }
  | { type: "DELETE_STRATEGIC_CITY"; cityId: string };

export type StrategicCityCommand = CommandEnvelope & StrategicCityCommandPayload;

export type StrategicCityCommandValidationResult =
  | { ok: true; command: StrategicCityCommand }
  | { ok: false; requestId?: string; reason: "INVALID_COMMAND" | "PROTOCOL_MISMATCH" };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function cell(value: unknown): GridCellCoord | null {
  const candidate = record(value);
  return candidate && Number.isInteger(candidate.x) && Number.isInteger(candidate.y)
    ? { x: candidate.x as number, y: candidate.y as number }
    : null;
}

function cells(value: unknown): GridCellCoord[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4096) return null;
  const result: GridCellCoord[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const parsed = cell(entry);
    if (!parsed) return null;
    const key = `${parsed.x},${parsed.y}`;
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return text(value) ? value : undefined;
}

function parseCity(value: unknown): StrategicCity | null {
  const candidate = record(value);
  if (!candidate || !text(candidate.id) || !text(candidate.name, 80)) return null;
  const parsedCells = cells(candidate.cells);
  if (!parsedCells || !text(candidate.recognizedStateId) || !text(candidate.deFactoStateId)) return null;
  const factionInfluenceId = nullableText(candidate.factionInfluenceId);
  const mayorId = nullableText(candidate.mayorId);
  if (factionInfluenceId === undefined || mayorId === undefined) return null;
  if (typeof candidate.isCapital !== "boolean") return null;
  if (!Number.isInteger(candidate.historicalBuildTypeCount) || (candidate.historicalBuildTypeCount as number) < 0) return null;
  return {
    id: candidate.id,
    name: candidate.name.trim(),
    cells: parsedCells,
    recognizedStateId: candidate.recognizedStateId,
    deFactoStateId: candidate.deFactoStateId,
    factionInfluenceId,
    mayorId,
    isCapital: candidate.isCapital,
    historicalBuildTypeCount: candidate.historicalBuildTypeCount as number
  };
}

function parsePatch(value: unknown): Partial<Omit<StrategicCity, "id">> | null {
  const candidate = record(value);
  if (!candidate) return null;
  const patch: Partial<Omit<StrategicCity, "id">> = {};
  if ("name" in candidate) {
    if (!text(candidate.name, 80)) return null;
    patch.name = candidate.name.trim();
  }
  if ("cells" in candidate) {
    const parsed = cells(candidate.cells);
    if (!parsed) return null;
    patch.cells = parsed;
  }
  for (const field of ["recognizedStateId", "deFactoStateId"] as const) {
    if (field in candidate) {
      if (!text(candidate[field])) return null;
      patch[field] = candidate[field];
    }
  }
  for (const field of ["factionInfluenceId", "mayorId"] as const) {
    if (field in candidate) {
      const parsed = nullableText(candidate[field]);
      if (parsed === undefined) return null;
      patch[field] = parsed;
    }
  }
  if ("isCapital" in candidate) {
    if (typeof candidate.isCapital !== "boolean") return null;
    patch.isCapital = candidate.isCapital;
  }
  if ("historicalBuildTypeCount" in candidate) {
    if (!Number.isInteger(candidate.historicalBuildTypeCount) || (candidate.historicalBuildTypeCount as number) < 0) return null;
    patch.historicalBuildTypeCount = candidate.historicalBuildTypeCount as number;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function isStrategicCityCommand(value: { type?: unknown }): value is StrategicCityCommand {
  return value.type === "CREATE_STRATEGIC_CITY" || value.type === "UPDATE_STRATEGIC_CITY" || value.type === "DELETE_STRATEGIC_CITY";
}

export function validateStrategicCityCommand(value: unknown): StrategicCityCommandValidationResult | null {
  const candidate = record(value);
  if (!candidate || !isStrategicCityCommand(candidate)) return null;
  const requestId = text(candidate.requestId, 128) ? candidate.requestId : undefined;
  if (candidate.protocolVersion !== COMMAND_PROTOCOL_VERSION) {
    return { ok: false, ...(requestId ? { requestId } : {}), reason: "PROTOCOL_MISMATCH" };
  }
  if (!requestId || !text(candidate.senderPlayerId) || !text(candidate.senderConnectionId) || !Number.isInteger(candidate.expectedRevision) || (candidate.expectedRevision as number) < 0) {
    return { ok: false, ...(requestId ? { requestId } : {}), reason: "INVALID_COMMAND" };
  }
  const envelope: CommandEnvelope = {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId,
    senderPlayerId: candidate.senderPlayerId,
    senderConnectionId: candidate.senderConnectionId,
    expectedRevision: candidate.expectedRevision as number
  };
  if (candidate.type === "CREATE_STRATEGIC_CITY") {
    const city = parseCity(candidate.city);
    return city ? { ok: true, command: { ...envelope, type: candidate.type, city } } : { ok: false, requestId, reason: "INVALID_COMMAND" };
  }
  if (!text(candidate.cityId)) return { ok: false, requestId, reason: "INVALID_COMMAND" };
  if (candidate.type === "DELETE_STRATEGIC_CITY") {
    return { ok: true, command: { ...envelope, type: candidate.type, cityId: candidate.cityId } };
  }
  const patch = parsePatch(candidate.patch);
  return patch
    ? { ok: true, command: { ...envelope, type: candidate.type, cityId: candidate.cityId, patch } }
    : { ok: false, requestId, reason: "INVALID_COMMAND" };
}
