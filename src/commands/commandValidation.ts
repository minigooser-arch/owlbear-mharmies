import { validateStrategicCityCommand } from "../cities/strategicCityCommands";
import { validateArmyCommand as validateCoreArmyCommand } from "./commandValidationCore";

export * from "./commandValidationCore";

const OBSOLETE_STRATEGIC_COMMANDS = new Set([
  "CREATE_WAR",
  "UPDATE_WAR",
  "END_WAR",
  "UPDATE_FACTION_TERRITORY_CELLS"
]);

export function validateArmyCommand(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.type === "string" && OBSOLETE_STRATEGIC_COMMANDS.has(candidate.type)) {
      const requestId = typeof candidate.requestId === "string" && candidate.requestId.trim().length > 0
        ? candidate.requestId
        : undefined;
      return {
        ok: false as const,
        ...(requestId ? { requestId } : {}),
        reason: "INVALID_COMMAND" as const
      };
    }
  }
  return validateStrategicCityCommand(value) ?? validateCoreArmyCommand(value);
}
