import fs from "node:fs";

function replace(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replace(
  "src/naval/battle/navalBattleLifecycle.ts",
  `  next.activeNavalBattle = null;\n  next.turn.phase = "MOVEMENT";\n  next.revision += 1;`,
  `  next.activeNavalBattle = null;\n  next.turn.phase = "POST_MOVEMENT";\n  next.revision += 1;`
);

replace(
  "src/commands/navalBattleRequestCommands.test.ts",
  `turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },`,
  `turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "POST_MOVEMENT" },`
);
replace(
  "src/commands/navalBattleRequestCommands.test.ts",
  `expect(result.state.scene.turn.phase).toBe("MOVEMENT");`,
  `expect(result.state.scene.turn.phase).toBe("POST_MOVEMENT");`
);

replace(
  "src/background/navalBattleRequestPersistenceIntegration.test.ts",
  `turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "MOVEMENT" },`,
  `turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 3, phase: "POST_MOVEMENT" },`
);

replace(
  "src/commands/commandProcessor.test.ts",
  `    const completed = processor.execute(\n      context("GM", "gm", commandState),\n      command({ type: "COMPLETE_TURN_NOW" })\n    );`,
  `    commandState.scene.turn.phase = "POST_MOVEMENT";\n    const completed = processor.execute(\n      context("GM", "gm", commandState),\n      command({ type: "COMPLETE_TURN_NOW" })\n    );`
);

replace(
  "src/tests/fourClient.integration.test.ts",
  `    await room.gm.send({ type: "COMPLETE_TURN_NOW" });`,
  `    await room.gm.send({ type: "COMPLETE_MOVEMENT_PHASE" });\n    await room.gm.send({ type: "COMPLETE_TURN_NOW" });`
);

console.log("Post-movement migration fixtures updated");
