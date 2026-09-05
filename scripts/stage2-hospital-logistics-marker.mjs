import fs from "node:fs";

const path = "src/commands/commandProcessor.ts";
let text = fs.readFileSync(path, "utf8");
const before = `        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.targetShipId] = result.target;\n        state.scene.activeNavalBattle = result.battle;\n        return undefined;\n      }\n      case \"CONFIRM_NAVAL_SHIP_EXIT\": {`;
const after = `        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = {\n          ...hospital,\n          logisticsActionUsedOnTurn: state.scene.turn.turnNumber,\n          revision: hospital.revision + 1\n        };\n        state.scene.ships[command.targetShipId] = result.target;\n        state.scene.activeNavalBattle = result.battle;\n        return undefined;\n      }\n      case \"CONFIRM_NAVAL_SHIP_EXIT\": {`;
if (!text.includes(before)) throw new Error("hospital success anchor missing");
text = text.replace(before, after);
fs.writeFileSync(path, text);
