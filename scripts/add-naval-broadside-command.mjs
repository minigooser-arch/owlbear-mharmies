import fs from "node:fs";

function replaceOnce(path, before, after, label) {
  const text = fs.readFileSync(path, "utf8");
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${path}: missing ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: duplicate ${label}`);
  fs.writeFileSync(path, text.slice(0, first) + after + text.slice(first + before.length));
}

replaceOnce(
  "src/shared/types.ts",
  `    | { type: "NAVAL_TURN_SHIP"; shipId: string; direction: "LEFT" | "RIGHT" }\n    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }`,
  `    | { type: "NAVAL_TURN_SHIP"; shipId: string; direction: "LEFT" | "RIGHT" }\n    | { type: "NAVAL_BROADSIDE_ATTACK"; shipId: string; targetShipId: string; friendlyFireConfirmed: boolean }\n    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }`,
  "broadside payload"
);

replaceOnce(
  "src/commands/commandValidation.ts",
  `  NAVAL_TURN_SHIP: (value) => boundedString(value.shipId) && (value.direction === "LEFT" || value.direction === "RIGHT")\n    ? { type: "NAVAL_TURN_SHIP", shipId: value.shipId, direction: value.direction }\n    : undefined,\n  END_NAVAL_SHIP_TURN:`,
  `  NAVAL_TURN_SHIP: (value) => boundedString(value.shipId) && (value.direction === "LEFT" || value.direction === "RIGHT")\n    ? { type: "NAVAL_TURN_SHIP", shipId: value.shipId, direction: value.direction }\n    : undefined,\n  NAVAL_BROADSIDE_ATTACK: (value) =>\n    boundedString(value.shipId) && boundedString(value.targetShipId) && typeof value.friendlyFireConfirmed === "boolean"\n      ? {\n          type: "NAVAL_BROADSIDE_ATTACK",\n          shipId: value.shipId,\n          targetShipId: value.targetShipId,\n          friendlyFireConfirmed: value.friendlyFireConfirmed\n        }\n      : undefined,\n  END_NAVAL_SHIP_TURN:`,
  "broadside parser"
);

replaceOnce(
  "src/shared/permissions.ts",
  `    command.type === "NAVAL_TURN_SHIP" ||\n    command.type === "END_NAVAL_SHIP_TURN" ||`,
  `    command.type === "NAVAL_TURN_SHIP" ||\n    command.type === "NAVAL_BROADSIDE_ATTACK" ||\n    command.type === "END_NAVAL_SHIP_TURN" ||`,
  "broadside permission"
);

replaceOnce(
  "src/naval/battle/navalBroadside.ts",
  `  | "TARGET_DESTROYED"\n  | "FRIENDLY_TARGET"\n  | "OUTSIDE_BROADSIDE_SECTOR"`,
  `  | "TARGET_DESTROYED"\n  | "OUTSIDE_BROADSIDE_SECTOR"`,
  "friendly failure union"
);
replaceOnce(
  "src/naval/battle/navalBroadside.ts",
  `  if (input.attacker.sideId === input.target.sideId) {\n    return { ok: false, reason: "FRIENDLY_TARGET" };\n  }\n`,
  ``,
  "friendly domain rejection"
);

replaceOnce(
  "src/naval/battle/navalBroadside.test.ts",
  `  it("rejects same-side targets", () => {\n    expect(validateBroadsideTarget({\n      battle: battle(),\n      attackerId: "attacker",\n      targetId: "ally",\n      attacker: ship("red"),\n      target: ship("red"),\n      attackerCell,\n      targetCell: broadsideTarget,\n      sectorResolver: exactSector([broadsideTarget]),\n      distanceCells: () => 2,\n      hasLineOfSight: () => true\n    })).toEqual({ ok: false, reason: "FRIENDLY_TARGET" });\n  });`,
  `  it("leaves friendly-fire confirmation to the authoritative command layer", () => {\n    expect(validateBroadsideTarget({\n      battle: battle(),\n      attackerId: "attacker",\n      targetId: "ally",\n      attacker: ship("red"),\n      target: ship("red"),\n      attackerCell,\n      targetCell: broadsideTarget,\n      sectorResolver: exactSector([broadsideTarget]),\n      distanceCells: () => 2,\n      hasLineOfSight: () => true\n    })).toEqual({ ok: true, range: 2 });\n  });`,
  "friendly broadside test"
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `import { completeNavalBattle, startNavalBattle } from "../naval/battle/navalBattleLifecycle";\nimport { createNavalBattleRequest } from "../naval/battle/navalBattleRequest";`,
  `import { completeNavalBattle, startNavalBattle } from "../naval/battle/navalBattleLifecycle";\nimport { createNavalBattleRequest } from "../naval/battle/navalBattleRequest";\nimport { commitBroadsideAttack } from "../naval/battle/navalBroadside";\nimport { hasNavalBattleLineOfSight } from "../naval/battle/navalBattleLineOfSight";`,
  "broadside imports"
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `      case "NAVAL_SHORE_BOMBARDMENT": {`,
  `      case "NAVAL_BROADSIDE_ATTACK": {\n        const battle = state.scene.activeNavalBattle;\n        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n        const attacker = state.scene.ships?.[command.shipId];\n        if (!attacker) return "SHIP_NOT_FOUND";\n        const target = state.scene.ships?.[command.targetShipId];\n        if (!target) return "TARGET_SHIP_NOT_FOUND";\n        if (\n          attacker.status !== "IN_NAVAL_BATTLE" ||\n          attacker.battleId !== battle.id ||\n          !battle.participantShipIds.includes(command.shipId)\n        ) return "SHIP_NOT_IN_NAVAL_BATTLE";\n        if (\n          target.status !== "IN_NAVAL_BATTLE" ||\n          target.battleId !== battle.id ||\n          !battle.participantShipIds.includes(command.targetShipId)\n        ) return "TARGET_NOT_IN_NAVAL_BATTLE";\n        const relation = relationForSides(state.scene, attacker.sideId, target.sideId);\n        if ((attacker.sideId === target.sideId || relation === "ALLY") && !command.friendlyFireConfirmed) {\n          return "FRIENDLY_FIRE_CONFIRMATION_REQUIRED";\n        }\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const attackerPosition = commandPosition(state, command.shipId);\n        const targetPosition = commandPosition(state, command.targetShipId);\n        if (!attackerPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const attackerCell = this.cellForPosition(attackerPosition);\n        const targetCell = this.cellForPosition(targetPosition);\n        const occupiedShipCells = Object.entries(state.scene.ships ?? {})\n          .filter(([shipId, ship]) => shipId !== command.shipId && shipId !== command.targetShipId && ship.hp > 0)\n          .flatMap(([shipId]) => {\n            const position = commandPosition(state, shipId);\n            return position ? [this.cellForPosition?.(position)].filter((cell): cell is GridCellCoord => cell !== undefined) : [];\n          });\n        const result = commitBroadsideAttack({\n          battle,\n          ships: state.scene.ships ?? {},\n          attackerId: command.shipId,\n          targetId: command.targetShipId,\n          attackerCell,\n          targetCell,\n          distanceCells: (from, to) => Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)),\n          hasLineOfSight: (from, to) => hasNavalBattleLineOfSight({\n            scene: state.scene,\n            from,\n            to,\n            occupiedShipCells\n          }),\n          rollD6: this.rollD6\n        });\n        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.targetShipId] = result.target;\n        result.battle.events = [\n          ...result.battle.events,\n          {\n            type: "BROADSIDE_ATTACK",\n            sequence: result.battle.events.length + 1,\n            roundNumber: battle.roundNumber,\n            attackerShipId: command.shipId,\n            targetShipId: command.targetShipId,\n            rolledDamage: result.rolledDamage,\n            armor: result.armor,\n            damage: result.damage,\n            special: result.special\n          }\n        ];\n        state.scene.activeNavalBattle = result.battle;\n        if (result.target.hp <= 0) {\n          destroyReciprocalTransportCargo(state, command.targetShipId, result.target);\n          const sceneRevision = state.scene.revision;\n          const destroyed = destroyShip(state.scene as NavalSceneState, command.targetShipId);\n          state.scene = destroyed.scene;\n          state.scene.revision = sceneRevision;\n        }\n        return undefined;\n      }\n      case "NAVAL_SHORE_BOMBARDMENT": {`,
  "broadside processor case"
);

console.log("Naval broadside command patch applied");
