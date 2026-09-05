import fs from "node:fs";

const files = [
  "src/naval/battle/navalBattleLifecycle.test.ts",
  "src/commands/navalBattleCompletionCommands.test.ts",
  "src/background/navalBattleCompletionPersistenceIntegration.test.ts"
];

for (const path of files) {
  const before = fs.readFileSync(path, "utf8");
  if (!before.includes('toBe("MOVEMENT")')) throw new Error(`${path}: expected MOVEMENT assertion missing`);
  const after = before.replace('toBe("MOVEMENT")', 'toBe("POST_MOVEMENT")');
  fs.writeFileSync(path, after);
}
