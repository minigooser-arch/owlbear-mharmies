import fs from "node:fs";
const path = "src/ui/state/useExtensionState.ts";
let text = fs.readFileSync(path, "utf8");
const search = `  embarkedOnShipId: string | null;`;
if (!text.includes(search)) throw new Error("ArmyView embark field not found");
text = text.replace(search, `  embarkedOnShipId?: string | null;`);
fs.writeFileSync(path, text);
