import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/commands/commandProcessor.ts",
  `import { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";`,
  `import { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";\nimport { applyShipRevealUntilNextTurn } from "../naval/detection/navalVisibility";`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = result.attacker;\n        if (result.target.health.hp <= 0) {`,
  `        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = result.attacker;\n        state.scene.navalRevealUntilTurn = applyShipRevealUntilNextTurn({\n          shipId: command.shipId,\n          observerSideId: target.sideId,\n          revealUntilTurn: state.scene.navalRevealUntilTurn ?? {},\n          currentTurn: state.scene.turn.turnNumber\n        });\n        if (result.target.health.hp <= 0) {`
);

replaceOnce(
  "src/commands/navalShoreBombardmentCommands.test.ts",
  `    expect(result.state.scene.ships?.attacker?.shoreBombardmentUsedOnTurn).toBe(7);\n    expect(result.state.scene.activeNavalBattle?.completedShipIdsThisRound).toContain("attacker");`,
  `    expect(result.state.scene.ships?.attacker?.shoreBombardmentUsedOnTurn).toBe(7);\n    expect(result.state.scene.navalRevealUntilTurn).toEqual({ blue: { attacker: 8 } });\n    expect(result.state.scene.activeNavalBattle?.completedShipIdsThisRound).toContain("attacker");`
);
