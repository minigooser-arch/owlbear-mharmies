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

patch("src/shared/types.ts", (text) => {
  text = replaceOnce(
    text,
    `export interface NavalBattleRequest {\n  id: string;\n  initiatingShipId: string;\n  targetShipId: string;\n  createdOnTurn?: number;\n}\n`,
    `export interface NavalBattleRequest {\n  id: string;\n  initiatingShipId: string;\n  targetShipId: string;\n  createdOnTurn?: number;\n}\n\nexport interface TransportEmbarkRequest {\n  id: string;\n  shipId: string;\n  armyId: string;\n}\n`,
    "transport request interface"
  );
  text = replaceOnce(
    text,
    `  navalBattleRequests?: NavalBattleRequest[];\n  activeNavalBattle?: NavalBattleState | null;`,
    `  navalBattleRequests?: NavalBattleRequest[];\n  transportEmbarkRequests?: TransportEmbarkRequest[];\n  activeNavalBattle?: NavalBattleState | null;`,
    "scene transport requests"
  );
  text = replaceOnce(
    text,
    `    | { type: "CONFIRM_NAVAL_SHIP_EXIT"; shipId: string }\n    | { type: "REQUEST_NAVAL_BATTLE"; initiatingShipId: string; targetShipId: string }`,
    `    | { type: "CONFIRM_NAVAL_SHIP_EXIT"; shipId: string }\n    | { type: "EMBARK_ARMY"; shipId: string; armyId: string }\n    | { type: "ACCEPT_EMBARK_ARMY"; embarkRequestId: string; shipId: string; armyId: string }\n    | { type: "DISEMBARK_ARMY"; shipId: string; armyId: string }\n    | { type: "REQUEST_NAVAL_BATTLE"; initiatingShipId: string; targetShipId: string }`,
    "transport command payloads"
  );
  return text;
});

patch("src/shared/permissions.ts", (text) => replaceOnce(
  text,
  `  if (command.type === "REQUEST_NAVAL_BATTLE") {\n    const ship = context.ships?.get(command.initiatingShipId);\n    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };\n    return ledBy(context, ship.sideId);\n  }\n`,
  `  if (command.type === "REQUEST_NAVAL_BATTLE") {\n    const ship = context.ships?.get(command.initiatingShipId);\n    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };\n    return ledBy(context, ship.sideId);\n  }\n\n  if (command.type === "EMBARK_ARMY" || command.type === "DISEMBARK_ARMY") {\n    const ship = context.ships?.get(command.shipId);\n    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };\n    return ledBy(context, ship.sideId);\n  }\n\n  if (command.type === "ACCEPT_EMBARK_ARMY") {\n    const army = context.armies.get(command.armyId);\n    if (!army) return { allowed: false, reason: "ARMY_NOT_FOUND" };\n    return ledBy(context, army.sideId);\n  }\n`,
  "transport authorization"
));

patch("src/commands/commandValidation.ts", (text) => replaceOnce(
  text,
  `  REQUEST_NAVAL_BATTLE: (value) =>\n    boundedString(value.initiatingShipId) && boundedString(value.targetShipId)\n      ? {\n          type: "REQUEST_NAVAL_BATTLE",\n          initiatingShipId: value.initiatingShipId,\n          targetShipId: value.targetShipId\n        }\n      : undefined,`,
  `  EMBARK_ARMY: (value) =>\n    boundedString(value.shipId) && boundedString(value.armyId)\n      ? { type: "EMBARK_ARMY", shipId: value.shipId, armyId: value.armyId }\n      : undefined,\n  ACCEPT_EMBARK_ARMY: (value) =>\n    boundedString(value.embarkRequestId) && boundedString(value.shipId) && boundedString(value.armyId)\n      ? {\n          type: "ACCEPT_EMBARK_ARMY",\n          embarkRequestId: value.embarkRequestId,\n          shipId: value.shipId,\n          armyId: value.armyId\n        }\n      : undefined,\n  DISEMBARK_ARMY: (value) =>\n    boundedString(value.shipId) && boundedString(value.armyId)\n      ? { type: "DISEMBARK_ARMY", shipId: value.shipId, armyId: value.armyId }\n      : undefined,\n  REQUEST_NAVAL_BATTLE: (value) =>\n    boundedString(value.initiatingShipId) && boundedString(value.targetShipId)\n      ? {\n          type: "REQUEST_NAVAL_BATTLE",\n          initiatingShipId: value.initiatingShipId,\n          targetShipId: value.targetShipId\n        }\n      : undefined,`,
  "transport payload parsers"
));

patch("src/commands/commandProcessor.ts", (text) => {
  text = replaceOnce(
    text,
    `import { createNavalBattleRequest } from "../naval/battle/navalBattleRequest";\n`,
    `import { createNavalBattleRequest } from "../naval/battle/navalBattleRequest";\nimport { embarkArmy, disembarkArmy } from "../naval/transport/transportRules";\n`,
    "transport rule import"
  );
  text = replaceOnce(
    text,
    `      case "SET_SHIP_ROUTE":\n        return applyShipStrategicRouteCommand(state, command, this.cellForPosition);\n      case "REQUEST_NAVAL_BATTLE": {`,
    `      case "SET_SHIP_ROUTE":\n        return applyShipStrategicRouteCommand(state, command, this.cellForPosition);\n      case "EMBARK_ARMY": {\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (ship.classId !== "TRANSPORT") return "SHIP_NOT_TRANSPORT";\n        if (ship.embarkedArmyId !== null) return "TRANSPORT_OCCUPIED";\n        if (army.embarkedOnShipId != null) return "ARMY_ALREADY_EMBARKED";\n        if (ship.sideId !== army.sideId) {\n          state.scene.transportEmbarkRequests ??= [];\n          state.scene.transportEmbarkRequests = state.scene.transportEmbarkRequests\n            .filter((request) => request.shipId !== command.shipId && request.armyId !== command.armyId);\n          state.scene.transportEmbarkRequests.push({\n            id: command.requestId,\n            shipId: command.shipId,\n            armyId: command.armyId\n          });\n          return undefined;\n        }\n        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = embarked.ship;\n        state.armies[command.armyId] = embarked.army;\n        return undefined;\n      }\n      case "ACCEPT_EMBARK_ARMY": {\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        const request = state.scene.transportEmbarkRequests?.find((candidate) =>\n          candidate.id === command.embarkRequestId &&\n          candidate.shipId === command.shipId &&\n          candidate.armyId === command.armyId\n        );\n        if (!request) return "EMBARK_REQUEST_NOT_FOUND";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (ship.classId !== "TRANSPORT") return "SHIP_NOT_TRANSPORT";\n        if (ship.embarkedArmyId !== null) return "TRANSPORT_OCCUPIED";\n        if (army.embarkedOnShipId != null) return "ARMY_ALREADY_EMBARKED";\n        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = embarked.ship;\n        state.armies[command.armyId] = embarked.army;\n        state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])\n          .filter((candidate) => candidate.id !== request.id);\n        return undefined;\n      }\n      case "DISEMBARK_ARMY": {\n        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        const army = state.armies[command.armyId];\n        if (!army) return "ARMY_NOT_FOUND";\n        if (ship.classId !== "TRANSPORT") return "SHIP_NOT_TRANSPORT";\n        const disembarked = disembarkArmy(command.shipId, ship, command.armyId, army);\n        if (!disembarked.ok) return disembarked.reason;\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = disembarked.ship;\n        state.armies[command.armyId] = disembarked.army;\n        return undefined;\n      }\n      case "REQUEST_NAVAL_BATTLE": {`,
    "transport processor cases"
  );
  return text;
});

console.log("Stage 2 transport task 2 patch applied");
