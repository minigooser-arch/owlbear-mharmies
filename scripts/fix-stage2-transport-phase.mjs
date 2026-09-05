import fs from "node:fs";
const path = "src/commands/commandProcessor.ts";
let text = fs.readFileSync(path, "utf8");
for (const type of ["EMBARK_ARMY", "ACCEPT_EMBARK_ARMY", "DISEMBARK_ARMY"]) {
  const anchor = `      case "${type}": {\n`;
  if (!text.includes(anchor)) throw new Error(`Missing ${type}`);
  text = text.replace(anchor, `${anchor}        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n`);
}
fs.writeFileSync(path, text);
