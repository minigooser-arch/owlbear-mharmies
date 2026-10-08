const timeZone = "Europe/Moscow";
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23"
});

/**
 * One attempt per Moscow calendar day, not per browser uptime.
 * A missed 01:00 run becomes due as soon as a GM coordinator is online.
 */
export function dueDailySheetSyncDate(now: Date, lastSuccessfulDate?: string | null): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  const parts = Object.fromEntries(dateFormatter.formatToParts(now)
    .filter((entry) => entry.type !== "literal")
    .map((entry) => [entry.type, entry.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) < 1 || (lastSuccessfulDate && lastSuccessfulDate >= date)) return null;
  return date;
}
