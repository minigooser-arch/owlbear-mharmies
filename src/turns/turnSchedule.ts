import type { TurnState } from "../shared/types";

export const TURN_TIME_ZONE = "Europe/Moscow";
const TURN_HOUR = 15;
const STANDARD_DAYS = new Set([0, 3]); // Sunday / Wednesday in local calendar.

export interface TurnBoundary {
  kind: "STANDARD" | "DEFERRED";
  instant: Date;
  id: string;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TURN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function zonedParts(date: Date): ZonedParts {
  const map = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: map.year ?? 1970,
    month: map.month ?? 1,
    day: map.day ?? 1,
    hour: map.hour ?? 0,
    minute: map.minute ?? 0,
    second: map.second ?? 0
  };
}

function localDateTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = zonedParts(new Date(naiveUtc));
  const representedUtc = Date.UTC(first.year, first.month - 1, first.day, first.hour, first.minute, first.second);
  const offsetMs = representedUtc - naiveUtc;
  const candidate = new Date(naiveUtc - offsetMs);
  const check = zonedParts(candidate);
  if (
    check.year !== year || check.month !== month || check.day !== day ||
    check.hour !== hour || check.minute !== minute || check.second !== second
  ) {
    const secondPassUtc = Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, check.second);
    return new Date(candidate.getTime() - (secondPassUtc - naiveUtc));
  }
  return candidate;
}

function localCalendarDate(now: Date): Date {
  const parts = zonedParts(now);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function standardBoundaryForDate(localDate: Date): TurnBoundary | undefined {
  const weekday = localDate.getUTCDay();
  if (!STANDARD_DAYS.has(weekday)) return undefined;
  const year = localDate.getUTCFullYear();
  const month = localDate.getUTCMonth() + 1;
  const day = localDate.getUTCDate();
  const instant = localDateTimeToInstant(year, month, day, TURN_HOUR);
  const offsetMinutes = Math.round((Date.UTC(year, month - 1, day, TURN_HOUR) - instant.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const offsetRemainder = String(absolute % 60).padStart(2, "0");
  const localIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T15:00:00${sign}${offsetHours}:${offsetRemainder}`;
  return { kind: "STANDARD", instant, id: `STANDARD:${localIso}` };
}

export function getNextStandardTurnBoundary(now: Date): TurnBoundary {
  const local = localCalendarDate(now);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(local.getTime() + offset * 86_400_000);
    const boundary = standardBoundaryForDate(date);
    if (boundary && boundary.instant.getTime() > now.getTime()) return boundary;
  }
  throw new Error("NEXT_TURN_BOUNDARY_NOT_FOUND");
}

export function getLatestStandardTurnBoundary(now: Date): TurnBoundary | undefined {
  const local = localCalendarDate(now);
  for (let offset = 0; offset >= -7; offset -= 1) {
    const date = new Date(local.getTime() + offset * 86_400_000);
    const boundary = standardBoundaryForDate(date);
    if (boundary && boundary.instant.getTime() <= now.getTime()) return boundary;
  }
  return undefined;
}

export function deferredBoundary(until: Date): TurnBoundary {
  return { kind: "DEFERRED", instant: new Date(until), id: `DEFERRED:${until.toISOString()}` };
}

export function getDueTurnBoundary(now: Date, turn: TurnState): TurnBoundary | null {
  if (turn.autoTurnsPaused) return null;
  if (turn.deferredUntil) {
    const instant = new Date(turn.deferredUntil);
    if (!Number.isFinite(instant.getTime())) return null;
    const boundary = deferredBoundary(instant);
    return now.getTime() >= instant.getTime() && turn.lastProcessedBoundaryId !== boundary.id
      ? boundary
      : null;
  }
  const latest = getLatestStandardTurnBoundary(now);
  if (!latest || latest.id === turn.lastProcessedBoundaryId) return null;
  return latest;
}
