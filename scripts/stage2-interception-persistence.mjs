import fs from "node:fs";

const path = "src/shared/validation.ts";
let text = fs.readFileSync(path, "utf8");

const importAnchor = `  NavalInitiativeEntry,\n  PlannedRoute,`;
const importReplacement = `  NavalInitiativeEntry,\n  NavalInterceptionState,\n  PlannedRoute,`;
if (!text.includes(importAnchor)) throw new Error("interception import anchor missing");
text = text.replace(importAnchor, importReplacement);

const helperAnchor = `function normalizeBooleanMap(value: unknown): Record<string, boolean> {\n  if (!isRecord(value)) return {};\n  const result: Record<string, boolean> = {};\n  for (const [key, rawBoolean] of Object.entries(value)) {\n    if (nonEmptyString(key) && typeof rawBoolean === "boolean") result[key] = rawBoolean;\n  }\n  return result;\n}\n\nfunction normalizeNavalBattle(value: unknown): NavalBattleState | undefined {`;
const helperReplacement = `function normalizeBooleanMap(value: unknown): Record<string, boolean> {\n  if (!isRecord(value)) return {};\n  const result: Record<string, boolean> = {};\n  for (const [key, rawBoolean] of Object.entries(value)) {\n    if (nonEmptyString(key) && typeof rawBoolean === "boolean") result[key] = rawBoolean;\n  }\n  return result;\n}\n\nfunction normalizeNavalInterceptions(value: unknown): Record<string, NavalInterceptionState> {\n  if (!isRecord(value)) return {};\n  const result: Record<string, NavalInterceptionState> = {};\n  for (const [shipId, rawInterception] of Object.entries(value)) {\n    if (\n      !nonEmptyString(shipId) ||\n      !isRecord(rawInterception) ||\n      !nonEmptyString(rawInterception.cruiserShipId) ||\n      !nonNegativeInteger(rawInterception.activatedRoundNumber)\n    ) continue;\n    result[shipId] = {\n      cruiserShipId: rawInterception.cruiserShipId,\n      activatedRoundNumber: rawInterception.activatedRoundNumber\n    };\n  }\n  return result;\n}\n\nfunction normalizeNavalBattle(value: unknown): NavalBattleState | undefined {`;
if (!text.includes(helperAnchor)) throw new Error("interception helper anchor missing");
text = text.replace(helperAnchor, helperReplacement);

const outputAnchor = `    movementRemainingByShip: normalizeNumberMap(value.movementRemainingByShip),\n    actionUsedByShip: normalizeBooleanMap(value.actionUsedByShip),\n    exitedShipIds: uniqueStrings(value.exitedShipIds),`;
const outputReplacement = `    movementRemainingByShip: normalizeNumberMap(value.movementRemainingByShip),\n    actionUsedByShip: normalizeBooleanMap(value.actionUsedByShip),\n    interceptions: normalizeNavalInterceptions(value.interceptions),\n    exitedShipIds: uniqueStrings(value.exitedShipIds),`;
if (!text.includes(outputAnchor)) throw new Error("interception output anchor missing");
text = text.replace(outputAnchor, outputReplacement);

fs.writeFileSync(path, text);
