import fs from "node:fs";

const path = "src/commands/commandProcessor.ts";
let text = fs.readFileSync(path, "utf8");
const search = `          state.scene.activeNavalBattle = confirmNavalShipExit(\n            battle,\n            state.scene.ships ?? {},\n            command.shipId\n          );\n          return undefined;`;
const replacement = `          state.scene.activeNavalBattle = confirmNavalShipExit(\n            battle,\n            state.scene.ships ?? {},\n            command.shipId\n          );\n          state.scene.ships ??= {};\n          state.scene.ships[command.shipId] = {\n            ...ship,\n            temporaryHp: 0,\n            revision: ship.revision + 1\n          };\n          return undefined;`;
if (!text.includes(search)) throw new Error("naval exit command anchor not found");
text = text.replace(search, replacement);
fs.writeFileSync(path, text);
