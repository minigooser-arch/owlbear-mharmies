import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/shared/types.ts",
  `    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "SET_ACTIVE_NAVAL_SHIP"; shipId: string }`,
  `    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "NAVAL_HOSPITAL_SUPPORT"; shipId: string; targetShipId: string }\n    | { type: "SET_ACTIVE_NAVAL_SHIP"; shipId: string }`
);

replaceOnce(
  "src/commands/commandValidation.ts",
  `  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  SET_ACTIVE_NAVAL_SHIP:`,
  `  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  NAVAL_HOSPITAL_SUPPORT: (value) =>\n    boundedString(value.shipId) && boundedString(value.targetShipId)\n      ? { type: "NAVAL_HOSPITAL_SUPPORT", shipId: value.shipId, targetShipId: value.targetShipId }\n      : undefined,\n  SET_ACTIVE_NAVAL_SHIP:`
);

replaceOnce(
  "src/shared/permissions.ts",
  `    command.type === "NAVAL_TURN_SHIP" ||\n    command.type === "END_NAVAL_SHIP_TURN"`,
  `    command.type === "NAVAL_TURN_SHIP" ||\n    command.type === "END_NAVAL_SHIP_TURN" ||\n    command.type === "NAVAL_HOSPITAL_SUPPORT"`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `import { embarkArmy, disembarkArmy, validateTransportInteraction } from "../naval/transport/transportRules";`,
  `import { embarkArmy, disembarkArmy, validateTransportInteraction } from "../naval/transport/transportRules";\nimport { commitHospitalSupport } from "../naval/hospital/hospitalSupport";`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `    private readonly positionForCell?: (cell: GridCellCoord) => Vector2,\n    private readonly detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set()\n  ) {}`,
  `    private readonly positionForCell?: (cell: GridCellCoord) => Vector2,\n    private readonly detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),\n    private readonly rollD6: () => number = () => Math.floor(Math.random() * 6) + 1\n  ) {}`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `      case "CONFIRM_NAVAL_SHIP_EXIT": {`,
  `      case "NAVAL_HOSPITAL_SUPPORT": {\n        const battle = state.scene.activeNavalBattle;\n        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n        const hospital = state.scene.ships?.[command.shipId];\n        if (!hospital) return "SHIP_NOT_FOUND";\n        const target = state.scene.ships?.[command.targetShipId];\n        if (!target) return "TARGET_SHIP_NOT_FOUND";\n        if (\n          hospital.status !== "IN_NAVAL_BATTLE" ||\n          hospital.battleId !== battle.id ||\n          !battle.participantShipIds.includes(command.shipId)\n        ) return "SHIP_NOT_IN_NAVAL_BATTLE";\n        if (\n          target.status !== "IN_NAVAL_BATTLE" ||\n          target.battleId !== battle.id ||\n          !battle.participantShipIds.includes(command.targetShipId)\n        ) return "TARGET_NOT_IN_NAVAL_BATTLE";\n        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const hospitalPosition = commandPosition(state, command.shipId);\n        const targetPosition = commandPosition(state, command.targetShipId);\n        if (!hospitalPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";\n        const result = commitHospitalSupport({\n          battle,\n          ships: state.scene.ships ?? {},\n          hospitalId: command.shipId,\n          targetId: command.targetShipId,\n          hospital,\n          target,\n          hospitalCell: this.cellForPosition(hospitalPosition),\n          targetCell: this.cellForPosition(targetPosition),\n          rollD6: this.rollD6\n        });\n        if (!result.ok) return result.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.targetShipId] = result.target;\n        state.scene.activeNavalBattle = result.battle;\n        return undefined;\n      }\n      case "CONFIRM_NAVAL_SHIP_EXIT": {`
);
