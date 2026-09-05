import fs from "node:fs";

const path = "src/commands/commandProcessor.ts";
let text = fs.readFileSync(path, "utf8");
const before = `          state.scene.activeNavalBattle = confirmNavalShipExit(\n            battle,\n            state.scene.ships ?? {},\n            command.shipId\n          );\n          return undefined;`;
const after = `          state.scene.activeNavalBattle = confirmNavalShipExit(\n            battle,\n            state.scene.ships ?? {},\n            command.shipId\n          );\n          if (ship.temporaryHp > 0) {\n            state.scene.ships ??= {};\n            state.scene.ships[command.shipId] = {\n              ...ship,\n              temporaryHp: 0,\n              revision: ship.revision + 1\n            };\n          }\n          return undefined;`;
if (!text.includes(before)) throw new Error("naval exit anchor missing");
text = text.replace(before, after);
fs.writeFileSync(path, text);
