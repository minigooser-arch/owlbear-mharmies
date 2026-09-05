import fs from "node:fs";

const path = "src/commands/commandProcessor.ts";
let text = fs.readFileSync(path, "utf8");
const before = `          state.scene.ships ??= {};\n          state.scene.ships[command.shipId] = {\n            ...ship,\n            temporaryHp: 0,\n            revision: ship.revision + 1\n          };`;
const after = `          if (ship.temporaryHp > 0) {\n            state.scene.ships ??= {};\n            state.scene.ships[command.shipId] = {\n              ...ship,\n              temporaryHp: 0,\n              revision: ship.revision + 1\n            };\n          }`;
if (!text.includes(before)) throw new Error("conditional exit temp hp anchor missing");
text = text.replace(before, after);
fs.writeFileSync(path, text);
