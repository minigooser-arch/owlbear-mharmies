import fs from "node:fs";

const path = "src/shared/types.ts";
let text = fs.readFileSync(path, "utf8");

const initiativeAnchor = `export interface NavalInitiativeEntry {\n  shipId: string;\n  initialRoll: number;\n  bonus: number;\n  total: number;\n  tieBreakRolls: number[];\n}\n\nexport interface NavalBattleState {`;
const initiativeReplacement = `export interface NavalInitiativeEntry {\n  shipId: string;\n  initialRoll: number;\n  bonus: number;\n  total: number;\n  tieBreakRolls: number[];\n}\n\nexport interface NavalInterceptionState {\n  cruiserShipId: string;\n  activatedRoundNumber: number;\n}\n\nexport interface NavalBattleState {`;
if (!text.includes(initiativeAnchor)) throw new Error("Naval initiative anchor missing");
text = text.replace(initiativeAnchor, initiativeReplacement);

const battleAnchor = `  actionUsedByShip: Record<string, boolean>;\n  exitedShipIds: string[];`;
const battleReplacement = `  actionUsedByShip: Record<string, boolean>;\n  interceptions?: Record<string, NavalInterceptionState>;\n  exitedShipIds: string[];`;
if (!text.includes(battleAnchor)) throw new Error("Naval battle action anchor missing");
text = text.replace(battleAnchor, battleReplacement);

fs.writeFileSync(path, text);
