import fs from "node:fs";

const path = "src/commands/transportGeometryCommands.test.ts";
const before = fs.readFileSync(path, "utf8");
const search = `  const reciprocal = options.reciprocal ?? false;\n  const commandScene = scene();\n  if (reciprocal) commandScene.ships!.transport = {\n    ...commandScene.ships!.transport!,\n    embarkedArmyId: "army"\n  };`;
const replacement = `  const reciprocal = options.reciprocal ?? false;\n  const commandScene = scene();\n  const transportShip = commandScene.ships?.transport;\n  if (!transportShip) throw new Error("Expected transport fixture");\n  if (reciprocal && commandScene.ships) commandScene.ships.transport = {\n    ...transportShip,\n    embarkedArmyId: "army"\n  };`;
if (!before.includes(search)) throw new Error("geometry test lint anchor not found");
const after = before.replace(search, replacement);
fs.writeFileSync(path, after);
