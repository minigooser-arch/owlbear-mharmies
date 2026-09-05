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
  `    | { type: "COMPLETE_NAVAL_BATTLE" }\n    | { type: "CREATE_SIDE"; side: Side }`,
  `    | { type: "COMPLETE_NAVAL_BATTLE" }\n    | { type: "COMPLETE_MOVEMENT_PHASE" }\n    | { type: "REOPEN_MOVEMENT_PHASE" }\n    | { type: "CREATE_SIDE"; side: Side }`,
  "phase command payloads"
));

patch("src/commands/commandValidation.ts", (text) => replaceOnce(
  text,
  `  COMPLETE_NAVAL_BATTLE: () => ({ type: "COMPLETE_NAVAL_BATTLE" }),\n  CREATE_SIDE: (value) => {`,
  `  COMPLETE_NAVAL_BATTLE: () => ({ type: "COMPLETE_NAVAL_BATTLE" }),\n  COMPLETE_MOVEMENT_PHASE: () => ({ type: "COMPLETE_MOVEMENT_PHASE" }),\n  REOPEN_MOVEMENT_PHASE: () => ({ type: "REOPEN_MOVEMENT_PHASE" }),\n  CREATE_SIDE: (value) => {`,
  "phase command parsers"
));

patch("src/commands/commandProcessor.ts", (text) => {
  text = replaceOnce(
    text,
    `      case "REQUEST_NAVAL_BATTLE": {\n        const initiatingShip = state.scene.ships?.[command.initiatingShipId];`,
    `      case "REQUEST_NAVAL_BATTLE": {\n        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";\n        const initiatingShip = state.scene.ships?.[command.initiatingShipId];`,
    "naval request phase gate"
  );
  text = replaceOnce(
    text,
    `      case "COMPLETE_NAVAL_BATTLE": {\n        const battle = state.scene.activeNavalBattle;`,
    `      case "COMPLETE_MOVEMENT_PHASE":\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        state.scene.turn.phase = "POST_MOVEMENT";\n        state.scene.transportEmbarkRequests = [];\n        return undefined;\n      case "REOPEN_MOVEMENT_PHASE":\n        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";\n        if (state.scene.activeNavalBattle?.status === "ACTIVE") return "NAVAL_BATTLE_ACTIVE";\n        state.scene.turn.phase = "MOVEMENT";\n        state.scene.navalBattleRequests = [];\n        return undefined;\n      case "COMPLETE_NAVAL_BATTLE": {\n        const battle = state.scene.activeNavalBattle;`,
    "phase command processor cases"
  );
  text = replaceOnce(
    text,
    `      case "COMPLETE_TURN_NOW": {\n        const armyCells =`,
    `      case "COMPLETE_TURN_NOW": {\n        if (state.scene.activeNavalBattle?.status === "ACTIVE") return "NAVAL_BATTLE_ACTIVE";\n        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";\n        const armyCells =`,
    "complete turn phase gate"
  );
  return text;
});

console.log("Global naval phase commands patched");
