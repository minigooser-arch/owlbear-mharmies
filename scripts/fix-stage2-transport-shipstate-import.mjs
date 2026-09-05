import fs from "node:fs";
const path = "src/commands/commandProcessor.ts";
let text = fs.readFileSync(path, "utf8");
const anchor = `  GridCellCoord,\n  Vector2\n} from "../shared/types";`;
if (!text.includes(anchor)) throw new Error("ShipState import anchor not found");
text = text.replace(anchor, `  GridCellCoord,\n  ShipState,\n  Vector2\n} from "../shared/types";`);
fs.writeFileSync(path, text);
