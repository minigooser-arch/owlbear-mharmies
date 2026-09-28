import type { ConscriptionLaw, StateDemography } from "../shared/types";

export interface PopulationCalendarOptions {
  today: string;
  timeZone: string;
}

function calendarDay(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : undefined;
}

function daysBetween(from: string, to: string): number {
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (start === undefined || end === undefined || end <= start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

function lawFor(record: StateDemography, laws: readonly ConscriptionLaw[]): ConscriptionLaw | undefined {
  return laws.find((law) => law.id === record.conscriptionLawId && law.active !== false);
}

export function recalculateHumanResourceCapacity(
  record: StateDemography,
  laws: readonly ConscriptionLaw[]
): StateDemography {
  const law = lawFor(record, laws);
  const rate = law?.rate ?? record.conscriptionRate;
  const capacity = Math.max(0, record.population * Math.min(1, Math.max(0, rate)));
  return {
    ...record,
    conscriptionRate: Math.min(1, Math.max(0, rate)),
    humanResourceCapacity: capacity,
    humanResource: Math.min(Math.max(0, record.humanResource), capacity)
  };
}

export function applyPopulationCalendar(
  record: StateDemography,
  laws: readonly ConscriptionLaw[],
  options: PopulationCalendarOptions
): StateDemography {
  const recalculated = recalculateHumanResourceCapacity(record, laws);
  if (recalculated.lastPopulationCalculationDate === options.today) return recalculated;
  if (!recalculated.lastPopulationCalculationDate) {
    return { ...recalculated, lastPopulationCalculationDate: options.today };
  }

  const days = daysBetween(recalculated.lastPopulationCalculationDate, options.today);
  if (days === 0) {
    return recalculated.lastPopulationCalculationDate && recalculated.lastPopulationCalculationDate > options.today
      ? recalculated
      : { ...recalculated, lastPopulationCalculationDate: options.today };
  }

  const factor = Number.isFinite(recalculated.populationGrowthFactor) && recalculated.populationGrowthFactor > 0
    ? recalculated.populationGrowthFactor
    : 1;
  const population = recalculated.population * factor ** days;
  return recalculateHumanResourceCapacity({
    ...recalculated,
    population,
    lastPopulationCalculationDate: options.today
  }, laws);
}

export function populationDateInTimeZone(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
