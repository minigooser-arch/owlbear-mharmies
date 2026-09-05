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

patch("src/commands/commandProcessor.ts", (text) => {
  text = replaceOnce(
    text,
    `function relationForSides(scene: SceneState, leftSideId: string, rightSideId: string): "ALLY" | "NEUTRAL" | "ENEMY" {\n  if (leftSideId === rightSideId) return "ALLY";\n  return scene.relations[leftSideId]?.[rightSideId] ?? scene.relations[rightSideId]?.[leftSideId] ?? "NEUTRAL";\n}\n`,
    `function relationForSides(scene: SceneState, leftSideId: string, rightSideId: string): "ALLY" | "NEUTRAL" | "ENEMY" {\n  if (leftSideId === rightSideId) return "ALLY";\n  return scene.relations[leftSideId]?.[rightSideId] ?? scene.relations[rightSideId]?.[leftSideId] ?? "NEUTRAL";\n}\n\nfunction destroyReciprocalTransportCargo(\n  state: CommandState,\n  shipId: string,\n  ship: ShipState\n): void {\n  if (ship.classId !== "TRANSPORT" || ship.embarkedArmyId == null) return;\n  const cargoId = ship.embarkedArmyId;\n  const cargo = state.armies[cargoId];\n  if (!cargo || cargo.embarkedOnShipId !== shipId) return;\n  const destroyed = destroyArmy(state.armies, state.scene.battleGroups, cargoId);\n  state.armies = destroyed.armies;\n  state.scene.battleGroups = destroyed.battleGroups;\n  state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])\n    .filter((request) => request.shipId !== shipId && request.armyId !== cargoId);\n}\n`,
    "transport cargo destruction helper"
  );

  text = replaceOnce(
    text,
    `      case "UNREGISTER_SHIP": {\n        if (!state.scene.ships?.[command.shipId]) return "SHIP_NOT_FOUND";\n        const sceneRevision = state.scene.revision;\n        const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);`,
    `      case "UNREGISTER_SHIP": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        destroyReciprocalTransportCargo(state, command.shipId, ship);\n        const sceneRevision = state.scene.revision;\n        const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);`,
    "unregister transport cargo destruction"
  );

  text = replaceOnce(
    text,
    `        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = {\n          ...ship,\n          hp: command.hp,\n          revision: ship.revision + 1\n        };`,
    `        if (command.hp <= 0) {\n          destroyReciprocalTransportCargo(state, command.shipId, ship);\n        }\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = {\n          ...ship,\n          hp: command.hp,\n          embarkedArmyId: command.hp <= 0 && ship.classId === "TRANSPORT"\n            ? null\n            : ship.embarkedArmyId,\n          revision: ship.revision + 1\n        };`,
    "hp zero transport cargo destruction"
  );

  return text;
});

console.log("Stage 2 transport task 4 patch applied");
