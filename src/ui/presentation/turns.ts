import type { TurnState } from "../../shared/types";
import { getDueTurnBoundary, getNextStandardTurnBoundary } from "../../turns/turnSchedule";

const MOSCOW_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export interface TurnStatusPresentation {
  title: string;
  status: string;
  kind: "PAUSED" | "DEFERRED" | "STANDARD" | "DUE";
}

export function formatMoscowDateTime(date: Date): string {
  return `${MOSCOW_FORMATTER.format(date)} МСК`;
}

export function turnStatusPresentation(turn: TurnState, now: Date = new Date()): TurnStatusPresentation {
  const title = `Ход №${turn.turnNumber}`;
  if (turn.autoTurnsPaused) {
    return { title, status: "Автоматические ходы остановлены", kind: "PAUSED" };
  }
  if (turn.deferredUntil) {
    const deferred = new Date(turn.deferredUntil);
    return {
      title,
      status: `Перенесён: ${formatMoscowDateTime(deferred)}`,
      kind: "DEFERRED"
    };
  }
  const due = getDueTurnBoundary(now, turn);
  if (due) {
    return {
      title,
      status: `Смена хода ожидается сейчас · ${formatMoscowDateTime(due.instant)}`,
      kind: "DUE"
    };
  }
  const next = getNextStandardTurnBoundary(now);
  return {
    title,
    status: `Следующая смена: ${formatMoscowDateTime(next.instant)}`,
    kind: "STANDARD"
  };
}

export function moscowLocalInputToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}:00+03:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
