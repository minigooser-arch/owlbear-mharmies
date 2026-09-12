import { validateStrategicCityCommand } from "../cities/strategicCityCommands";
import { validateArmyCommand as validateCoreArmyCommand } from "./commandValidationCore";

export * from "./commandValidationCore";

export function validateArmyCommand(value: unknown) {
  return validateStrategicCityCommand(value) ?? validateCoreArmyCommand(value);
}
