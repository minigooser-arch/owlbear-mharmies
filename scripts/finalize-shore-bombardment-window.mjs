import fs from "node:fs";

function replaceOnce(path, before, after, label) {
  const text = fs.readFileSync(path, "utf8");
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${path}: missing ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: duplicate ${label}`);
  fs.writeFileSync(path, text.slice(0, first) + after + text.slice(first + before.length));
}

replaceOnce(
  "src/naval/shore/shoreBombardment.ts",
  `import { useNavalAction } from "../battle/navalRoundFlow";\nimport { SHIP_CLASSES } from "../ships/shipClasses";`,
  `import { useNavalAction } from "../battle/navalRoundFlow";\nimport { isInNormalBroadsideMask } from "../battle/broadsideMask";\nimport { SHIP_CLASSES } from "../ships/shipClasses";`,
  "canonical mask import"
);
replaceOnce(
  "src/naval/shore/shoreBombardment.ts",
  `  sectorResolver: ShoreBombardmentSectorResolver;`,
  `  sectorResolver?: ShoreBombardmentSectorResolver;`,
  "optional sector resolver"
);
replaceOnce(
  "src/naval/shore/shoreBombardment.ts",
  `  if (!input.sectorResolver({\n    attackerCell: input.attackerCell,\n    targetCell: input.targetCell,\n    facing: input.attacker.facing\n  })) {\n    return { ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" };\n  }`,
  `  const inBroadsideSector = input.sectorResolver\n    ? input.sectorResolver({\n        attackerCell: input.attackerCell,\n        targetCell: input.targetCell,\n        facing: input.attacker.facing\n      })\n    : isInNormalBroadsideMask(\n        input.attacker.classId,\n        input.attacker.facing,\n        input.attackerCell,\n        input.targetCell\n      );\n  if (!inBroadsideSector) {\n    return { ok: false, reason: "OUTSIDE_BROADSIDE_SECTOR" };\n  }`,
  "canonical sector validation"
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `import { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";`,
  `import { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";`,
  "shore import anchor"
);
replaceOnce(
  "src/commands/commandProcessor.ts",
  `    private readonly visibleArmyTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),\n    private readonly shoreBombardmentSectorResolver: ShoreBombardmentSectorResolver = () => false,\n    private readonly shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,\n    private readonly shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false,\n    private readonly shoreBombardmentWindowOpen: () => boolean = () => false\n  ) {}`,
  `    private readonly visibleArmyTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),\n    shoreBombardmentSectorResolver: ShoreBombardmentSectorResolver = () => false,\n    shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,\n    shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false,\n    shoreBombardmentWindowOpen: () => boolean = () => false\n  ) {\n    // Retain the legacy positional signature while the old tests/UI are migrated.\n    // Final shore validation is authoritative and does not depend on injected shims.\n    void shoreBombardmentSectorResolver;\n    void shoreBombardmentDistanceCells;\n    void shoreBombardmentHasLineOfSight;\n    void shoreBombardmentWindowOpen;\n  }`,
  "legacy shore constructor shims"
);

const oldShoreCase = `      case "NAVAL_SHORE_BOMBARDMENT": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const target = state.armies[command.armyId];\n        if (!target) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const shipPosition = commandPosition(state, command.shipId);\n        const targetPosition = commandPosition(state, command.armyId);\n        if (!shipPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const shipCell = this.cellForPosition(shipPosition);\n        const targetCell = this.cellForPosition(targetPosition);\n        const activeBattle = state.scene.activeNavalBattle?.status === "ACTIVE"\n          ? state.scene.activeNavalBattle\n          : undefined;\n        if (!activeBattle && !this.shoreBombardmentWindowOpen()) {\n          return "SHORE_BOMBARDMENT_WINDOW_CLOSED";\n        }\n        const result = commitShoreBombardment({\n          attackerId: command.shipId,\n          attacker: ship,\n          targetId: command.armyId,\n          target,\n          attackerCell: shipCell,\n          targetCell,\n          currentTurn: state.scene.turn.turnNumber,\n          targetVisible: this.visibleArmyTargetsForSide(ship.sideId).has(command.armyId),\n          targetCellSupportsLand:\n            target.embarkedOnShipId == null && cellSupportsDomain(state.scene, targetCell, "LAND"),\n          sectorResolver: this.shoreBombardmentSectorResolver,\n          distanceCells: this.shoreBombardmentDistanceCells,\n          hasLineOfSight: this.shoreBombardmentHasLineOfSight,\n          ...(activeBattle ? { battle: activeBattle, battleShips: state.scene.ships ?? {} } : {}),\n          rollD6: this.rollD6\n        });\n        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = result.attacker;\n        state.scene.navalRevealUntilTurn = applyShipRevealUntilNextTurn({\n          shipId: command.shipId,\n          observerSideId: target.sideId,\n          revealUntilTurn: state.scene.navalRevealUntilTurn ?? {},\n          currentTurn: state.scene.turn.turnNumber\n        });\n        if (result.target.health.hp <= 0) {\n          const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);\n          state.armies = destroyed.armies;\n          state.scene.battleGroups = destroyed.battleGroups;\n        } else {\n          state.armies[command.armyId] = result.target;\n        }\n        if (result.battle) state.scene.activeNavalBattle = result.battle;\n        return undefined;\n      }`;

const newShoreCase = `      case "NAVAL_SHORE_BOMBARDMENT": {\n        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";\n        if (state.scene.activeNavalBattle?.status === "ACTIVE") return "NAVAL_BATTLE_ACTIVE";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const target = state.armies[command.armyId];\n        if (!target) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const shipPosition = commandPosition(state, command.shipId);\n        const targetPosition = commandPosition(state, command.armyId);\n        if (!shipPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const shipCell = this.cellForPosition(shipPosition);\n        const targetCell = this.cellForPosition(targetPosition);\n        const occupiedShipCells = Object.entries(state.scene.ships ?? {})\n          .filter(([shipId, candidate]) => shipId !== command.shipId && candidate.hp > 0)\n          .flatMap(([shipId]) => {\n            const position = commandPosition(state, shipId);\n            return position\n              ? [this.cellForPosition?.(position)].filter((cell): cell is GridCellCoord => cell !== undefined)\n              : [];\n          });\n        const result = commitShoreBombardment({\n          attackerId: command.shipId,\n          attacker: ship,\n          targetId: command.armyId,\n          target,\n          attackerCell: shipCell,\n          targetCell,\n          currentTurn: state.scene.turn.turnNumber,\n          targetVisible: this.visibleArmyTargetsForSide(ship.sideId).has(command.armyId),\n          targetCellSupportsLand:\n            target.embarkedOnShipId == null && cellSupportsDomain(state.scene, targetCell, "LAND"),\n          distanceCells: (from, to) => Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)),\n          hasLineOfSight: (from, to) => hasNavalBattleLineOfSight({\n            scene: state.scene,\n            from,\n            to,\n            occupiedShipCells\n          }),\n          rollD6: this.rollD6\n        });\n        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = result.attacker;\n        state.scene.navalRevealUntilTurn = applyShipRevealUntilNextTurn({\n          shipId: command.shipId,\n          observerSideId: target.sideId,\n          revealUntilTurn: state.scene.navalRevealUntilTurn ?? {},\n          currentTurn: state.scene.turn.turnNumber\n        });\n        if (result.target.health.hp <= 0) {\n          const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);\n          state.armies = destroyed.armies;\n          state.scene.battleGroups = destroyed.battleGroups;\n        } else {\n          state.armies[command.armyId] = result.target;\n        }\n        return undefined;\n      }`;
replaceOnce("src/commands/commandProcessor.ts", oldShoreCase, newShoreCase, "shore command case");

console.log("Final shore bombardment window patched");
