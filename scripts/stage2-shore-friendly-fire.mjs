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
  `    | { type: "NAVAL_SHORE_BOMBARDMENT"; shipId: string; armyId: string }`,
  `    | { type: "NAVAL_SHORE_BOMBARDMENT"; shipId: string; armyId: string; friendlyFireConfirmed: boolean }`,
  "shore payload"
));

patch("src/commands/commandValidation.ts", (text) => replaceOnce(
  text,
  `  NAVAL_SHORE_BOMBARDMENT: (value) =>\n    boundedString(value.shipId) && boundedString(value.armyId)\n      ? { type: "NAVAL_SHORE_BOMBARDMENT", shipId: value.shipId, armyId: value.armyId }\n      : undefined,`,
  `  NAVAL_SHORE_BOMBARDMENT: (value) =>\n    boundedString(value.shipId) && boundedString(value.armyId) && typeof value.friendlyFireConfirmed === "boolean"\n      ? {\n          type: "NAVAL_SHORE_BOMBARDMENT",\n          shipId: value.shipId,\n          armyId: value.armyId,\n          friendlyFireConfirmed: value.friendlyFireConfirmed\n        }\n      : undefined,`,
  "shore parser"
));

patch("src/naval/shore/shoreBombardment.ts", (text) => {
  text = replaceOnce(
    text,
    `  | "SHIP_CANNOT_BOMBARD"\n  | "FRIENDLY_TARGET"\n  | "TARGET_NOT_VISIBLE"`,
    `  | "SHIP_CANNOT_BOMBARD"\n  | "TARGET_NOT_VISIBLE"`,
    "friendly target failure"
  );
  text = replaceOnce(
    text,
    `  if (input.attacker.sideId === input.target.sideId) {\n    return { ok: false, reason: "FRIENDLY_TARGET" };\n  }\n`,
    ``,
    "same-side domain rejection"
  );
  return text;
});

patch("src/commands/commandProcessor.ts", (text) => replaceOnce(
  text,
  `        const target = state.armies[command.armyId];\n        if (!target) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";`,
  `        const target = state.armies[command.armyId];\n        if (!target) return "ARMY_NOT_FOUND";\n        const relation = relationForSides(state.scene, ship.sideId, target.sideId);\n        if ((ship.sideId === target.sideId || relation === "ALLY") && !command.friendlyFireConfirmed) {\n          return "FRIENDLY_FIRE_CONFIRMATION_REQUIRED";\n        }\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";`,
  "shore friendly fire gate"
));

for (const path of [
  "src/commands/navalShoreBombardmentCommands.test.ts",
  "src/commands/navalShoreBombardmentWindow.test.ts"
]) {
  patch(path, (text) => {
    // Enemy-target fixtures should preserve the old behavior explicitly.
    return text.replaceAll(
      `      armyId: "army"\n`,
      `      armyId: "army",\n      friendlyFireConfirmed: false\n`
    ).replaceAll(
      `    armyId: "army"\n`,
      `    armyId: "army",\n    friendlyFireConfirmed: false\n`
    );
  });
}

console.log("Shore friendly fire patch applied");
