import fs from "node:fs";

const path = "src/background/application.ts";
let text = fs.readFileSync(path, "utf8");
const search = `    const moving = armies.filter((record) => record.state.status === "MOVING");`;
const replacement = `    const moving = armies.filter((record) => {\n      if (record.state.status !== "MOVING") return false;\n      const shipId = record.state.embarkedOnShipId;\n      if (shipId == null) return true;\n      return scene.ships?.[shipId]?.embarkedArmyId !== record.item.id;\n    });`;
if (!text.includes(search)) throw new Error("movement filter anchor not found");
text = text.replace(search, replacement);
fs.writeFileSync(path, text);
