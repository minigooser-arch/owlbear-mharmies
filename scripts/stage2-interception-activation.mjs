import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Missing anchor: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Duplicate anchor: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

patch("src/shared/types.ts", (text) => replaceOnce(
  text,
  `    | { type: "NAVAL_BROADSIDE_ATTACK"; shipId: string; targetShipId: string; friendlyFireConfirmed: boolean }\n    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }`,
  `    | { type: "NAVAL_BROADSIDE_ATTACK"; shipId: string; targetShipId: string; friendlyFireConfirmed: boolean }\n    | { type: "NAVAL_ACTIVATE_INTERCEPTION"; shipId: string }\n    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }`,
  "interception command payload"
));

patch("src/commands/commandValidation.ts", (text) => replaceOnce(
  text,
  `  NAVAL_BROADSIDE_ATTACK: (value) =>\n    boundedString(value.shipId) && boundedString(value.targetShipId) && typeof value.friendlyFireConfirmed === "boolean"\n      ? {\n          type: "NAVAL_BROADSIDE_ATTACK",\n          shipId: value.shipId,\n          targetShipId: value.targetShipId,\n          friendlyFireConfirmed: value.friendlyFireConfirmed\n        }\n      : undefined,\n  END_NAVAL_SHIP_TURN:`,
  `  NAVAL_BROADSIDE_ATTACK: (value) =>\n    boundedString(value.shipId) && boundedString(value.targetShipId) && typeof value.friendlyFireConfirmed === "boolean"\n      ? {\n          type: "NAVAL_BROADSIDE_ATTACK",\n          shipId: value.shipId,\n          targetShipId: value.targetShipId,\n          friendlyFireConfirmed: value.friendlyFireConfirmed\n        }\n      : undefined,\n  NAVAL_ACTIVATE_INTERCEPTION: (value) => boundedString(value.shipId)\n    ? { type: "NAVAL_ACTIVATE_INTERCEPTION", shipId: value.shipId }\n    : undefined,\n  END_NAVAL_SHIP_TURN:`,
  "interception parser"
));

patch("src/shared/permissions.ts", (text) => replaceOnce(
  text,
  `    command.type === "NAVAL_BROADSIDE_ATTACK" ||\n    command.type === "END_NAVAL_SHIP_TURN" ||`,
  `    command.type === "NAVAL_BROADSIDE_ATTACK" ||\n    command.type === "NAVAL_ACTIVATE_INTERCEPTION" ||\n    command.type === "END_NAVAL_SHIP_TURN" ||`,
  "interception permission"
));

patch("src/commands/commandProcessor.ts", (text) => {
  text = replaceOnce(
    text,
    `import { commitBroadsideAttack } from "../naval/battle/navalBroadside";\n`,
    `import { commitBroadsideAttack } from "../naval/battle/navalBroadside";\nimport { activateCruiserInterception } from "../naval/interception/cruiserInterception";\n`,
    "interception import"
  );
  text = replaceOnce(
    text,
    `      case "NAVAL_SHORE_BOMBARDMENT": {`,
    `      case "NAVAL_ACTIVATE_INTERCEPTION": {\n        const battle = state.scene.activeNavalBattle;\n        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n        const cruiser = state.scene.ships?.[command.shipId];\n        if (!cruiser) return "SHIP_NOT_FOUND";\n        if (\n          cruiser.status !== "IN_NAVAL_BATTLE" ||\n          cruiser.battleId !== battle.id ||\n          !battle.participantShipIds.includes(command.shipId)\n        ) return "SHIP_NOT_IN_NAVAL_BATTLE";\n        const result = activateCruiserInterception({\n          battle,\n          cruiserId: command.shipId,\n          cruiser,\n          ships: state.scene.ships ?? {}\n        });\n        if (!result.ok) return result.reason;\n        result.battle.events = [\n          ...result.battle.events,\n          {\n            type: "INTERCEPTION_ACTIVATED",\n            sequence: result.battle.events.length + 1,\n            roundNumber: battle.roundNumber,\n            cruiserShipId: command.shipId\n          }\n        ];\n        state.scene.activeNavalBattle = result.battle;\n        return undefined;\n      }\n      case "NAVAL_SHORE_BOMBARDMENT": {`,
    "interception command case"
  );
  return text;
});

console.log("Interception activation patch applied");
