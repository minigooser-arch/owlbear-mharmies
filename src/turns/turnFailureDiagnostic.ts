/** Error breadcrumbs are stored separately from the world scene, so a
 * failed turn commit can still be diagnosed without mutating the game. */
export type TurnFailureStage = "GET_STATES" | "GRID" | "CHECKPOINT" | "PERSISTENCE" | "TURN_TICK";

export interface TurnFailureDiagnostic {
  turnNumber: number;
  stage: TurnFailureStage;
  code: string;
  at: string;
}

const stages: readonly TurnFailureStage[] = [
  "GET_STATES", "GRID", "CHECKPOINT", "PERSISTENCE", "TURN_TICK"
];

export function describeTurnFailure(
  turnNumber: number,
  stage: TurnFailureStage,
  error: unknown,
  now: Date
): TurnFailureDiagnostic {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const rawCode = typeof candidate?.code === "string" && candidate.code.length > 0
    ? candidate.code
    : typeof candidate?.message === "string" && candidate.message.length > 0
      ? candidate.message
      : String(error);
  // Never surface URLs, authorization tokens or unexpectedly large browser
  // exception messages in shared scene metadata.
  const code = rawCode
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/(?:token|authorization|secret)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .slice(0, 180);
  return { turnNumber, stage, code, at: now.toISOString() };
}

export function readTurnFailureDiagnostic(value: unknown): TurnFailureDiagnostic | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<TurnFailureDiagnostic>;
  if (typeof record.turnNumber !== "number" || !Number.isSafeInteger(record.turnNumber) ||
      record.turnNumber < 1 || !stages.includes(record.stage as TurnFailureStage) ||
      typeof record.code !== "string" || record.code.length > 180 ||
      typeof record.at !== "string" || !Number.isFinite(Date.parse(record.at))) return undefined;
  return {
    turnNumber: record.turnNumber,
    stage: record.stage as TurnFailureStage,
    code: record.code,
    at: record.at
  };
}
