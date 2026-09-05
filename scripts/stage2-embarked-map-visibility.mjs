import fs from "node:fs";
const path = "src/owlbear/extensionServices.ts";
let text = fs.readFileSync(path, "utf8");
const oldBlock = `  const mapVisibleSourceIds = new Set(input.mapVisibleSourceIds);\n  for (const army of input.armies) {\n    if (input.role === "GM" || memberSideIds.has(army.state.sideId)) {\n      mapVisibleSourceIds.add(army.item.id);\n    }\n  }`;
const newBlock = `  const shipById = new Map(shipRecords.map((record) => [record.item.id, record.state]));\n  const reciprocallyEmbarkedArmyIds = new Set(\n    input.armies\n      .filter(({ item, state }) =>\n        state.embarkedOnShipId != null &&\n        shipById.get(state.embarkedOnShipId)?.embarkedArmyId === item.id\n      )\n      .map(({ item }) => item.id)\n  );\n  const mapVisibleSourceIds = new Set(\n    [...input.mapVisibleSourceIds].filter((id) => !reciprocallyEmbarkedArmyIds.has(id))\n  );\n  for (const army of input.armies) {\n    if (\n      !reciprocallyEmbarkedArmyIds.has(army.item.id) &&\n      (input.role === "GM" || memberSideIds.has(army.state.sideId))\n    ) {\n      mapVisibleSourceIds.add(army.item.id);\n    }\n  }`;
if (!text.includes(oldBlock)) throw new Error("map visibility anchor missing");
text = text.replace(oldBlock, newBlock);
fs.writeFileSync(path, text);
