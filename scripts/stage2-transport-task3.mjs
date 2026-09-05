import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0) throw new Error(`Missing anchor: ${label}`);
  if (text.indexOf(search, first + search.length) >= 0) throw new Error(`Duplicate anchor: ${label}`);
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}

patch("src/shared/types.ts", (text) => replaceOnce(
  text,
  `    | { type: "DISEMBARK_ARMY"; shipId: string; armyId: string }`,
  `    | { type: "DISEMBARK_ARMY"; shipId: string; armyId: string; targetCell: GridCellCoord }`,
  "disembark target cell type"
));

patch("src/commands/commandValidation.ts", (text) => replaceOnce(
  text,
  `  DISEMBARK_ARMY: (value) =>\n    boundedString(value.shipId) && boundedString(value.armyId)\n      ? { type: "DISEMBARK_ARMY", shipId: value.shipId, armyId: value.armyId }\n      : undefined,`,
  `  DISEMBARK_ARMY: (value) => {\n    const targetCell = parseGridCell(value.targetCell);\n    return boundedString(value.shipId) && boundedString(value.armyId) && targetCell\n      ? { type: "DISEMBARK_ARMY", shipId: value.shipId, armyId: value.armyId, targetCell }\n      : undefined;\n  },`,
  "disembark parser"
));

patch("src/shared/validation.ts", (text) => {
  text = replaceOnce(
    text,
    `  TerrainType,\n  TurnPhase,`,
    `  TerrainType,\n  TransportEmbarkRequest,\n  TurnPhase,`,
    "transport request import"
  );
  text = replaceOnce(
    text,
    `function normalizeNavalBattleRequest(value: unknown): NavalBattleRequest | undefined {\n  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.initiatingShipId) || !nonEmptyString(value.targetShipId)) {\n    return undefined;\n  }\n  const request: NavalBattleRequest = {\n    id: value.id,\n    initiatingShipId: value.initiatingShipId,\n    targetShipId: value.targetShipId\n  };\n  if (nonNegativeInteger(value.createdOnTurn)) request.createdOnTurn = value.createdOnTurn;\n  return request;\n}\n`,
    `function normalizeNavalBattleRequest(value: unknown): NavalBattleRequest | undefined {\n  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.initiatingShipId) || !nonEmptyString(value.targetShipId)) {\n    return undefined;\n  }\n  const request: NavalBattleRequest = {\n    id: value.id,\n    initiatingShipId: value.initiatingShipId,\n    targetShipId: value.targetShipId\n  };\n  if (nonNegativeInteger(value.createdOnTurn)) request.createdOnTurn = value.createdOnTurn;\n  return request;\n}\n\nfunction normalizeTransportEmbarkRequest(value: unknown): TransportEmbarkRequest | undefined {\n  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.shipId) || !nonEmptyString(value.armyId)) {\n    return undefined;\n  }\n  return { id: value.id, shipId: value.shipId, armyId: value.armyId };\n}\n`,
    "transport request normalizer"
  );
  text = replaceOnce(
    text,
    `  const activeNavalBattle = raw.activeNavalBattle === null ? null : normalizeNavalBattle(raw.activeNavalBattle) ?? null;`,
    `  const transportEmbarkRequests = Array.isArray(raw.transportEmbarkRequests)\n    ? raw.transportEmbarkRequests\n        .map(normalizeTransportEmbarkRequest)\n        .filter((request): request is TransportEmbarkRequest => request !== undefined)\n    : [];\n  const activeNavalBattle = raw.activeNavalBattle === null ? null : normalizeNavalBattle(raw.activeNavalBattle) ?? null;`,
    "transport request normalization"
  );
  text = replaceOnce(
    text,
    `    ships: normalizeShips(raw.ships),\n    navalBattleRequests,\n    activeNavalBattle,`,
    `    ships: normalizeShips(raw.ships),\n    navalBattleRequests,\n    transportEmbarkRequests,\n    activeNavalBattle,`,
    "transport request scene output"
  );
  return text;
});

patch("src/commands/commandProcessor.ts", (text) => {
  text = replaceOnce(
    text,
    `import { releaseBattleGroup } from "../battles/battleGroupService";`,
    `import { joinReinforcements, releaseBattleGroup } from "../battles/battleGroupService";`,
    "battle join import"
  );
  text = replaceOnce(
    text,
    `import { embarkArmy, disembarkArmy } from "../naval/transport/transportRules";`,
    `import { embarkArmy, disembarkArmy, validateTransportInteraction } from "../naval/transport/transportRules";`,
    "transport validation import"
  );
  text = replaceOnce(
    text,
    `function bumpArmy(army: ArmyState, patch: Partial<ArmyState>): ArmyState {\n  return { ...army, ...patch, revision: army.revision + 1 };\n}\n`,
    `function bumpArmy(army: ArmyState, patch: Partial<ArmyState>): ArmyState {\n  return { ...army, ...patch, revision: army.revision + 1 };\n}\n\nfunction commandPosition(state: CommandState, id: string): Vector2 | undefined {\n  return state.positions?.[id] ?? state.items[id]?.position;\n}\n\nfunction sameCell(left: GridCellCoord, right: GridCellCoord): boolean {\n  return left.x === right.x && left.y === right.y;\n}\n\nfunction relationForSides(scene: SceneState, leftSideId: string, rightSideId: string): "ALLY" | "NEUTRAL" | "ENEMY" {\n  if (leftSideId === rightSideId) return "ALLY";\n  return scene.relations[leftSideId]?.[rightSideId] ?? scene.relations[rightSideId]?.[leftSideId] ?? "NEUTRAL";\n}\n`,
    "transport geometry helpers"
  );
  const oldCases = `      case "EMBARK_ARMY": {\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (ship.classId !== "TRANSPORT") return "SHIP_NOT_TRANSPORT";\n        if (ship.embarkedArmyId !== null) return "TRANSPORT_OCCUPIED";\n        if (army.embarkedOnShipId != null) return "ARMY_ALREADY_EMBARKED";\n        if (ship.sideId !== army.sideId) {\n          state.scene.transportEmbarkRequests ??= [];\n          state.scene.transportEmbarkRequests = state.scene.transportEmbarkRequests\n            .filter((request) => request.shipId !== command.shipId && request.armyId !== command.armyId);\n          state.scene.transportEmbarkRequests.push({\n            id: command.requestId,\n            shipId: command.shipId,\n            armyId: command.armyId\n          });\n          return undefined;\n        }\n        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = embarked.ship;\n        state.armies[command.armyId] = embarked.army;\n        return undefined;\n      }\n      case "ACCEPT_EMBARK_ARMY": {\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        const request = state.scene.transportEmbarkRequests?.find((candidate) =>\n          candidate.id === command.embarkRequestId &&\n          candidate.shipId === command.shipId &&\n          candidate.armyId === command.armyId\n        );\n        if (!request) return "EMBARK_REQUEST_NOT_FOUND";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (ship.classId !== "TRANSPORT") return "SHIP_NOT_TRANSPORT";\n        if (ship.embarkedArmyId !== null) return "TRANSPORT_OCCUPIED";\n        if (army.embarkedOnShipId != null) return "ARMY_ALREADY_EMBARKED";\n        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = embarked.ship;\n        state.armies[command.armyId] = embarked.army;\n        state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])\n          .filter((candidate) => candidate.id !== request.id);\n        return undefined;\n      }\n      case "DISEMBARK_ARMY": {\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (ship.classId !== "TRANSPORT") return "SHIP_NOT_TRANSPORT";\n        const disembarked = disembarkArmy(command.shipId, ship, command.armyId, army);\n        if (!disembarked.ok) return disembarked.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = disembarked.ship;\n        state.armies[command.armyId] = disembarked.army;\n        return undefined;\n      }`;
  const newCases = `      case "EMBARK_ARMY": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition) return "TRANSPORT_POSITION_UNAVAILABLE";\n        const shipPosition = commandPosition(state, command.shipId);\n        const armyPosition = commandPosition(state, command.armyId);\n        if (!shipPosition || !armyPosition) return "TRANSPORT_POSITION_UNAVAILABLE";\n        const shipCell = this.cellForPosition(shipPosition);\n        const armyCell = this.cellForPosition(armyPosition);\n        const geometry = validateTransportInteraction({\n          action: "EMBARK",\n          phase: state.scene.turn.phase,\n          ship,\n          army,\n          shipCell,\n          interactionCell: armyCell,\n          sameCellSupportsLandAndSea: sameCell(shipCell, armyCell) &&\n            cellSupportsDomain(state.scene, shipCell, "LAND") &&\n            cellSupportsDomain(state.scene, shipCell, "SEA")\n        });\n        if (!geometry.ok) return geometry.reason;\n        if (ship.sideId !== army.sideId) {\n          state.scene.transportEmbarkRequests ??= [];\n          state.scene.transportEmbarkRequests = state.scene.transportEmbarkRequests\n            .filter((request) => request.shipId !== command.shipId && request.armyId !== command.armyId);\n          state.scene.transportEmbarkRequests.push({\n            id: command.requestId,\n            shipId: command.shipId,\n            armyId: command.armyId\n          });\n          return undefined;\n        }\n        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = embarked.ship;\n        state.armies[command.armyId] = embarked.army;\n        return undefined;\n      }\n      case "ACCEPT_EMBARK_ARMY": {\n        const request = state.scene.transportEmbarkRequests?.find((candidate) =>\n          candidate.id === command.embarkRequestId &&\n          candidate.shipId === command.shipId &&\n          candidate.armyId === command.armyId\n        );\n        if (!request) return "EMBARK_REQUEST_NOT_FOUND";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition) return "TRANSPORT_POSITION_UNAVAILABLE";\n        const shipPosition = commandPosition(state, command.shipId);\n        const armyPosition = commandPosition(state, command.armyId);\n        if (!shipPosition || !armyPosition) return "TRANSPORT_POSITION_UNAVAILABLE";\n        const shipCell = this.cellForPosition(shipPosition);\n        const armyCell = this.cellForPosition(armyPosition);\n        const geometry = validateTransportInteraction({\n          action: "EMBARK",\n          phase: state.scene.turn.phase,\n          ship,\n          army,\n          shipCell,\n          interactionCell: armyCell,\n          sameCellSupportsLandAndSea: sameCell(shipCell, armyCell) &&\n            cellSupportsDomain(state.scene, shipCell, "LAND") &&\n            cellSupportsDomain(state.scene, shipCell, "SEA")\n        });\n        if (!geometry.ok) return geometry.reason;\n        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = embarked.ship;\n        state.armies[command.armyId] = embarked.army;\n        state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])\n          .filter((candidate) => candidate.id !== request.id);\n        return undefined;\n      }\n      case "DISEMBARK_ARMY": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (!this.cellForPosition || !this.positionForCell) return "TRANSPORT_POSITION_UNAVAILABLE";\n        const shipPosition = commandPosition(state, command.shipId);\n        if (!shipPosition) return "TRANSPORT_POSITION_UNAVAILABLE";\n        if (!cellSupportsDomain(state.scene, command.targetCell, "LAND")) return "LANDING_REQUIRES_LAND";\n        const shipCell = this.cellForPosition(shipPosition);\n        const geometry = validateTransportInteraction({\n          action: "DISEMBARK",\n          phase: state.scene.turn.phase,\n          ship,\n          army,\n          shipCell,\n          interactionCell: command.targetCell,\n          sameCellSupportsLandAndSea: sameCell(shipCell, command.targetCell) &&\n            cellSupportsDomain(state.scene, shipCell, "LAND") &&\n            cellSupportsDomain(state.scene, shipCell, "SEA")\n        });\n        if (!geometry.ok) return geometry.reason;\n        const disembarked = disembarkArmy(command.shipId, ship, command.armyId, army);\n        if (!disembarked.ok) return disembarked.reason;\n        const occupantIds = Object.entries(state.armies)\n          .filter(([armyId, candidate]) => armyId !== command.armyId && candidate.health.hp > 0 && candidate.embarkedOnShipId == null)\n          .filter(([armyId]) => {\n            const position = commandPosition(state, armyId);\n            return position ? sameCell(this.cellForPosition?.(position) ?? { x: NaN, y: NaN }, command.targetCell) : false;\n          })\n          .map(([armyId]) => armyId);\n        const nonEnemyOccupant = occupantIds.find((armyId) => {\n          const occupant = state.armies[armyId];\n          return occupant ? relationForSides(state.scene, army.sideId, occupant.sideId) !== "ENEMY" : false;\n        });\n        if (nonEnemyOccupant) return "LANDING_CELL_OCCUPIED";\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = disembarked.ship;\n        state.armies[command.armyId] = disembarked.army;\n        state.positions ??= {};\n        state.positions[command.armyId] = this.positionForCell(command.targetCell);\n        const enemyOccupants = occupantIds.filter((armyId) => {\n          const occupant = state.armies[armyId];\n          return occupant ? relationForSides(state.scene, army.sideId, occupant.sideId) === "ENEMY" : false;\n        });\n        if (enemyOccupants.length > 0) {\n          const contacts = enemyOccupants.map((armyId) => [command.armyId, armyId] as const);\n          state.scene.battleGroups = joinReinforcements(state.scene.battleGroups, contacts, () => command.requestId);\n          const group = state.scene.battleGroups.find((candidate) => candidate.participantIds.includes(command.armyId));\n          if (group) {\n            for (const participantId of group.participantIds) {\n              const participant = state.armies[participantId];\n              if (!participant) continue;\n              state.armies[participantId] = bumpArmy(participant, {\n                status: "IN_BATTLE",\n                stopReason: "BATTLE",\n                movement: { ...participant.movement, remainingUnits: 0 },\n                battleGroupId: group.battleId\n              });\n            }\n          }\n        }\n        return undefined;\n      }`;
  text = replaceOnce(text, oldCases, newCases, "authoritative transport cases");
  return text;
});

patch("src/background/application.ts", (text) => replaceOnce(
  text,
  `    if (command.type === "COMPLETE_TURN_NOW" || command.type === "REGISTER_SHIP" || command.type === "SET_SHIP_ROUTE" || command.type === "NAVAL_MOVE_FORWARD" || command.type === "START_NAVAL_BATTLE") {`,
  `    if (\n      command.type === "COMPLETE_TURN_NOW" ||\n      command.type === "REGISTER_SHIP" ||\n      command.type === "SET_SHIP_ROUTE" ||\n      command.type === "NAVAL_MOVE_FORWARD" ||\n      command.type === "START_NAVAL_BATTLE" ||\n      command.type === "EMBARK_ARMY" ||\n      command.type === "ACCEPT_EMBARK_ARMY" ||\n      command.type === "DISEMBARK_ARMY"\n    ) {`,
  "transport strategic grid wiring"
));

patch("src/commands/transportCommands.test.ts", (text) => {
  text = replaceOnce(
    text,
    `    armies: { army: army(armySide) },\n    barriers: {},\n    items: {}\n  };`,
    `    armies: { army: army(armySide) },\n    barriers: {},\n    items: {},\n    positions: {\n      transport: { x: 50, y: 50 },\n      army: { x: 150, y: 50 }\n    }\n  };`,
    "transport command test positions"
  );
  text = replaceOnce(
    text,
    `  return new CommandProcessor().execute(\n    context(playerId, commandState),\n    raw(playerId, payload) as unknown as ArmyCommand\n  );`,
    `  return new CommandProcessor(\n    () => new Date("2026-09-05T08:00:00Z"),\n    (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),\n    (cell) => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 })\n  ).execute(\n    context(playerId, commandState),\n    raw(playerId, payload) as unknown as ArmyCommand\n  );`,
    "transport command test grid"
  );
  text = text.replace(
    `      type: "DISEMBARK_ARMY",\n      shipId: "transport",\n      armyId: "army"\n    }))).toMatchObject({ ok: true, command: { type: "DISEMBARK_ARMY", shipId: "transport", armyId: "army" } });`,
    `      type: "DISEMBARK_ARMY",\n      shipId: "transport",\n      armyId: "army",\n      targetCell: { x: 1, y: 0 }\n    }))).toMatchObject({\n      ok: true,\n      command: { type: "DISEMBARK_ARMY", shipId: "transport", armyId: "army", targetCell: { x: 1, y: 0 } }\n    });`
  );
  text = text.replace(
    `      type: "DISEMBARK_ARMY",\n      shipId: "transport",\n      armyId: "army"\n    }, embarked.state);`,
    `      type: "DISEMBARK_ARMY",\n      shipId: "transport",\n      armyId: "army",\n      targetCell: { x: 1, y: 0 }\n    }, embarked.state);`
  );
  return text;
});

console.log("Stage 2 transport task 3 patch applied");
