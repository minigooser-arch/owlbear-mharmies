import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/shared/types.ts",
  `    | { type: "NAVAL_HOSPITAL_SUPPORT"; shipId: string; targetShipId: string }\n    | { type: "SET_ACTIVE_NAVAL_SHIP"; shipId: string }`,
  `    | { type: "NAVAL_HOSPITAL_SUPPORT"; shipId: string; targetShipId: string }\n    | { type: "NAVAL_SHORE_BOMBARDMENT"; shipId: string; armyId: string }\n    | { type: "SET_ACTIVE_NAVAL_SHIP"; shipId: string }`
);

replaceOnce(
  "src/commands/commandValidation.ts",
  `  NAVAL_HOSPITAL_SUPPORT: (value) =>\n    boundedString(value.shipId) && boundedString(value.targetShipId)\n      ? { type: "NAVAL_HOSPITAL_SUPPORT", shipId: value.shipId, targetShipId: value.targetShipId }\n      : undefined,\n  SET_ACTIVE_NAVAL_SHIP:`,
  `  NAVAL_HOSPITAL_SUPPORT: (value) =>\n    boundedString(value.shipId) && boundedString(value.targetShipId)\n      ? { type: "NAVAL_HOSPITAL_SUPPORT", shipId: value.shipId, targetShipId: value.targetShipId }\n      : undefined,\n  NAVAL_SHORE_BOMBARDMENT: (value) =>\n    boundedString(value.shipId) && boundedString(value.armyId)\n      ? { type: "NAVAL_SHORE_BOMBARDMENT", shipId: value.shipId, armyId: value.armyId }\n      : undefined,\n  SET_ACTIVE_NAVAL_SHIP:`
);

replaceOnce(
  "src/shared/permissions.ts",
  `    command.type === "END_NAVAL_SHIP_TURN" ||\n    command.type === "NAVAL_HOSPITAL_SUPPORT"\n  ) {`,
  `    command.type === "END_NAVAL_SHIP_TURN" ||\n    command.type === "NAVAL_HOSPITAL_SUPPORT" ||\n    command.type === "NAVAL_SHORE_BOMBARDMENT"\n  ) {`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `import { commitHospitalSupport } from "../naval/hospital/hospitalSupport";`,
  `import { commitHospitalSupport } from "../naval/hospital/hospitalSupport";\nimport { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `    private readonly detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),\n    private readonly rollD6: () => number = () => Math.floor(Math.random() * 6) + 1\n  ) {}`,
  `    private readonly detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),\n    private readonly rollD6: () => number = () => Math.floor(Math.random() * 6) + 1,\n    private readonly visibleArmyTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),\n    private readonly shoreBombardmentSectorResolver: ShoreBombardmentSectorResolver = () => false,\n    private readonly shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,\n    private readonly shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false\n  ) {}`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `      case "NAVAL_HOSPITAL_SUPPORT": {`,
  `      case "NAVAL_SHORE_BOMBARDMENT": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const target = state.armies[command.armyId];\n        if (!target) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const shipPosition = commandPosition(state, command.shipId);\n        const targetPosition = commandPosition(state, command.armyId);\n        if (!shipPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const shipCell = this.cellForPosition(shipPosition);\n        const targetCell = this.cellForPosition(targetPosition);\n        const activeBattle = state.scene.activeNavalBattle?.status === "ACTIVE"\n          ? state.scene.activeNavalBattle\n          : undefined;\n        const result = commitShoreBombardment({\n          attackerId: command.shipId,\n          attacker: ship,\n          targetId: command.armyId,\n          target,\n          attackerCell: shipCell,\n          targetCell,\n          currentTurn: state.scene.turn.turnNumber,\n          targetVisible: this.visibleArmyTargetsForSide(ship.sideId).has(command.armyId),\n          targetCellSupportsLand:\n            target.embarkedOnShipId == null && cellSupportsDomain(state.scene, targetCell, "LAND"),\n          sectorResolver: this.shoreBombardmentSectorResolver,\n          distanceCells: this.shoreBombardmentDistanceCells,\n          hasLineOfSight: this.shoreBombardmentHasLineOfSight,\n          ...(activeBattle ? { battle: activeBattle, battleShips: state.scene.ships ?? {} } : {}),\n          rollD6: this.rollD6\n        });\n        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = result.attacker;\n        if (result.target.health.hp <= 0) {\n          const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);\n          state.armies = destroyed.armies;\n          state.scene.battleGroups = destroyed.battleGroups;\n        } else {\n          state.armies[command.armyId] = result.target;\n        }\n        if (result.battle) state.scene.activeNavalBattle = result.battle;\n        return undefined;\n      }\n      case "NAVAL_HOSPITAL_SUPPORT": {`
);

replaceOnce(
  "src/background/application.ts",
  `import { validateNavalBattleRequest } from "../naval/battle/navalBattleRequest";`,
  `import { validateNavalBattleRequest } from "../naval/battle/navalBattleRequest";\nimport { hasNavalBattleLineOfSight } from "../naval/battle/navalBattleLineOfSight";\nimport { hasNavalLineOfSight } from "../naval/detection/navalLineOfSight";`
);

replaceOnce(
  "src/background/application.ts",
  `      command.type === "START_NAVAL_BATTLE" ||\n      command.type === "EMBARK_ARMY" ||`,
  `      command.type === "START_NAVAL_BATTLE" ||\n      command.type === "NAVAL_SHORE_BOMBARDMENT" ||\n      command.type === "EMBARK_ARMY" ||`
);

replaceOnce(
  "src/background/application.ts",
  `    let detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set<string>();\n    if (\n      command.type === "REQUEST_NAVAL_BATTLE" ||\n      (command.type === "START_NAVAL_BATTLE" && command.navalRequestId !== null)\n    ) {\n      try {\n        const detectionGraph = await buildSceneDetectionGraph({\n          scene,\n          armies: armyRecords,\n          sceneItems,\n          distancePort: this.grid,\n          visionBarriers: extractBarrierSegments(barrierRecords, "vision")\n        });\n        detectedNavalTargetsForSide = (sideId) =>\n          detectedShipIdsForSide(detectionGraph, scene.ships ?? {}, sideId);\n      } catch {\n        // Detection-dependent commands fail closed while authoritative geometry is unavailable.\n      }\n    }`,
  `    let detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set<string>();\n    let visibleArmyTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set<string>();\n    if (\n      command.type === "REQUEST_NAVAL_BATTLE" ||\n      command.type === "NAVAL_SHORE_BOMBARDMENT" ||\n      (command.type === "START_NAVAL_BATTLE" && command.navalRequestId !== null)\n    ) {\n      try {\n        const detectionGraph = await buildSceneDetectionGraph({\n          scene,\n          armies: armyRecords,\n          sceneItems,\n          distancePort: this.grid,\n          visionBarriers: extractBarrierSegments(barrierRecords, "vision")\n        });\n        detectedNavalTargetsForSide = (sideId) =>\n          detectedShipIdsForSide(detectionGraph, scene.ships ?? {}, sideId);\n        const armyIds = new Set(armyRecords.map((record) => record.item.id));\n        visibleArmyTargetsForSide = (sideId) => new Set(\n          [...(detectionGraph.visibleTargetsBySide.get(sideId) ?? [])]\n            .filter((unitId) => armyIds.has(unitId))\n        );\n      } catch {\n        // Detection-dependent commands fail closed while authoritative geometry is unavailable.\n      }\n    }`
);

replaceOnce(
  "src/background/application.ts",
  `    const result = new CommandProcessor(\n      () => this.wallClock(),\n      commandCellForPosition,\n      commandPositionForCell,\n      detectedNavalTargetsForSide\n    ).execute(`,
  `    let shoreBombardmentDistanceCells: (from: import("../shared/types").GridCellCoord, to: import("../shared/types").GridCellCoord) => number = () => Number.POSITIVE_INFINITY;\n    let shoreBombardmentHasLineOfSight: (from: import("../shared/types").GridCellCoord, to: import("../shared/types").GridCellCoord) => boolean = () => false;\n    if (command.type === "NAVAL_SHORE_BOMBARDMENT" && commandCellForPosition && commandPositionForCell) {\n      const attackerPosition = commandState.positions?.[command.shipId];\n      const targetPosition = commandState.positions?.[command.armyId];\n      if (attackerPosition && targetPosition) {\n        try {\n          const attackerCell = commandCellForPosition(attackerPosition);\n          const targetCell = commandCellForPosition(targetPosition);\n          const distance = await this.grid.distance(\n            commandPositionForCell(attackerCell),\n            commandPositionForCell(targetCell)\n          );\n          shoreBombardmentDistanceCells = () => distance;\n          const occupiedShipCells = Object.keys(scene.ships ?? {}).flatMap((shipId) => {\n            const position = commandState.positions?.[shipId];\n            return position ? [commandCellForPosition(position)] : [];\n          });\n          shoreBombardmentHasLineOfSight = (from, to) =>\n            scene.activeNavalBattle?.status === "ACTIVE"\n              ? hasNavalBattleLineOfSight({ scene, from, to, occupiedShipCells })\n              : hasNavalLineOfSight(scene, from, to);\n        } catch {\n          // Range and LOS remain fail-closed when authoritative grid geometry is unavailable.\n        }\n      }\n    }\n    const result = new CommandProcessor(\n      () => this.wallClock(),\n      commandCellForPosition,\n      commandPositionForCell,\n      detectedNavalTargetsForSide,\n      undefined,\n      visibleArmyTargetsForSide,\n      () => false,\n      shoreBombardmentDistanceCells,\n      shoreBombardmentHasLineOfSight\n    ).execute(`
);
