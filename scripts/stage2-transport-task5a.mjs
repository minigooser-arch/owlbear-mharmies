import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, search, replacement, label) {
  const index = text.indexOf(search);
  if (index < 0) throw new Error(`Missing anchor: ${label}`);
  if (text.indexOf(search, index + search.length) >= 0) throw new Error(`Duplicate anchor: ${label}`);
  return text.slice(0, index) + replacement + text.slice(index + search.length);
}

patch("src/ui/state/useExtensionState.ts", (text) => {
  text = replaceOnce(
    text,
    `  disbandPending: boolean;\n}\n\nexport interface ShipView {`,
    `  disbandPending: boolean;\n  embarkedOnShipId: string | null;\n}\n\nexport interface ShipView {`,
    "army embarked view"
  );
  text = replaceOnce(
    text,
    `export interface NavalRequestTargetView {\n  id: string;\n  name: string;\n  sideId: string;\n  sideName: string;\n}\n`,
    `export interface NavalRequestTargetView {\n  id: string;\n  name: string;\n  sideId: string;\n  sideName: string;\n}\n\nexport interface TransportEmbarkTargetView {\n  id: string;\n  name: string;\n  sideId: string;\n  sideName: string;\n}\n\nexport interface TransportEmbarkRequestView {\n  id: string;\n  shipId: string;\n  shipName: string;\n  shipSideId: string;\n  shipSideName: string;\n  armyId: string;\n  armyName: string;\n}\n`,
    "transport snapshot interfaces"
  );
  text = replaceOnce(
    text,
    `  navalRequestTargets?: readonly NavalRequestTargetView[];\n  pendingNavalBattleRequests?: readonly NavalBattleRequestView[];`,
    `  navalRequestTargets?: readonly NavalRequestTargetView[];\n  pendingNavalBattleRequests?: readonly NavalBattleRequestView[];\n  transportEmbarkTargets?: readonly TransportEmbarkTargetView[];\n  pendingTransportEmbarkRequests?: readonly TransportEmbarkRequestView[];`,
    "raw transport snapshot fields"
  );
  text = replaceOnce(
    text,
    `  navalRequestTargets: NavalRequestTargetView[];\n  pendingNavalBattleRequests: NavalBattleRequestView[];`,
    `  navalRequestTargets: NavalRequestTargetView[];\n  pendingNavalBattleRequests: NavalBattleRequestView[];\n  transportEmbarkTargets: TransportEmbarkTargetView[];\n  pendingTransportEmbarkRequests: TransportEmbarkRequestView[];`,
    "viewmodel transport fields"
  );
  text = replaceOnce(
    text,
    `      navalRequestTargets: [...(snapshot.navalRequestTargets ?? [])],\n      pendingNavalBattleRequests: [...(snapshot.pendingNavalBattleRequests ?? [])],`,
    `      navalRequestTargets: [...(snapshot.navalRequestTargets ?? [])],\n      pendingNavalBattleRequests: [...(snapshot.pendingNavalBattleRequests ?? [])],\n      transportEmbarkTargets: [...(snapshot.transportEmbarkTargets ?? [])],\n      pendingTransportEmbarkRequests: [...(snapshot.pendingTransportEmbarkRequests ?? [])],`,
    "viewmodel normalize transport arrays"
  );
  return text;
});

patch("src/owlbear/extensionServices.ts", (text) => {
  text = replaceOnce(
    text,
    `  ShipView,\n  UiCommand`,
    `  ShipView,\n  TransportEmbarkRequestView,\n  TransportEmbarkTargetView,\n  UiCommand`,
    "transport view imports"
  );
  text = replaceOnce(
    text,
    `  const pendingNavalBattleRequests: NavalBattleRequestView[] = input.role === "GM"\n    ? (input.scene.navalBattleRequests ?? []).map((request) => ({\n        id: request.id,\n        initiatingShipId: request.initiatingShipId,\n        targetShipId: request.targetShipId,\n        ...(request.createdOnTurn !== undefined ? { createdOnTurn: request.createdOnTurn } : {})\n      }))\n    : [];`,
    `  const pendingNavalBattleRequests: NavalBattleRequestView[] = input.role === "GM"\n    ? (input.scene.navalBattleRequests ?? []).map((request) => ({\n        id: request.id,\n        initiatingShipId: request.initiatingShipId,\n        targetShipId: request.targetShipId,\n        ...(request.createdOnTurn !== undefined ? { createdOnTurn: request.createdOnTurn } : {})\n      }))\n    : [];\n  const transportEmbarkTargets: TransportEmbarkTargetView[] = input.role === "PLAYER" && leaderSideIds.size > 0\n    ? input.armies\n        .filter(({ item, state }) =>\n          state.health.hp > 0 &&\n          state.embarkedOnShipId == null &&\n          !memberSideIds.has(state.sideId) &&\n          mapVisibleSourceIds.has(item.id)\n        )\n        .map(({ item, state }) => ({\n          id: item.id,\n          name: item.name ?? "Безымянная армия",\n          sideId: state.sideId,\n          sideName: sideNames.get(state.sideId) ?? "Неизвестная сторона"\n        }))\n    : [];\n  const armyRecordById = new Map(input.armies.map((record) => [record.item.id, record]));\n  const shipRecordById = new Map(shipRecords.map((record) => [record.item.id, record]));\n  const pendingTransportEmbarkRequests: TransportEmbarkRequestView[] = (input.scene.transportEmbarkRequests ?? [])\n    .flatMap((request) => {\n      const armyRecord = armyRecordById.get(request.armyId);\n      const shipRecord = shipRecordById.get(request.shipId);\n      if (!armyRecord || !shipRecord) return [];\n      if (input.role !== "GM" && !leaderSideIds.has(armyRecord.state.sideId)) return [];\n      return [{\n        id: request.id,\n        shipId: request.shipId,\n        shipName: shipRecord.item.name ?? "Безымянный транспорт",\n        shipSideId: shipRecord.state.sideId,\n        shipSideName: sideNames.get(shipRecord.state.sideId) ?? "Неизвестная сторона",\n        armyId: request.armyId,\n        armyName: armyRecord.item.name ?? "Безымянная армия"\n      }];\n    });`,
    "transport safe snapshot construction"
  );
  text = replaceOnce(
    text,
    `      supplyCheckedOnTurn: state.supply.checkedOnTurn,\n      disbandPending: state.disband.pending`,
    `      supplyCheckedOnTurn: state.supply.checkedOnTurn,\n      disbandPending: state.disband.pending,\n      embarkedOnShipId: state.embarkedOnShipId ?? null`,
    "army view embark link"
  );
  text = replaceOnce(
    text,
    `    navalRequestTargets,\n    pendingNavalBattleRequests,`,
    `    navalRequestTargets,\n    pendingNavalBattleRequests,\n    transportEmbarkTargets,\n    pendingTransportEmbarkRequests,`,
    "snapshot output transport fields"
  );
  text = replaceOnce(
    text,
    `  navalRequestTargets: [],\n  pendingNavalBattleRequests: [],`,
    `  navalRequestTargets: [],\n  pendingNavalBattleRequests: [],\n  transportEmbarkTargets: [],\n  pendingTransportEmbarkRequests: [],`,
    "loading transport fields"
  );
  return text;
});

patch("src/background/application.ts", (text) => {
  text = replaceOnce(
    text,
    `    const sceneItemById = new Map(sceneItems.map((item) => [item.id, item]));\n    const armyDetectionUnits = armies.map(({ item, state }) => ({`,
    `    const sceneItemById = new Map(sceneItems.map((item) => [item.id, item]));\n    const reciprocallyEmbarkedArmyIds = new Set(armies.flatMap(({ item, state }) => {\n      if (state.embarkedOnShipId == null) return [];\n      const ship = scene.ships?.[state.embarkedOnShipId];\n      return ship?.embarkedArmyId === item.id ? [item.id] : [];\n    }));\n    const activeLandArmies = armies.filter(({ item }) => !reciprocallyEmbarkedArmyIds.has(item.id));\n    const armyDetectionUnits = activeLandArmies.map(({ item, state }) => ({`,
    "exclude embarked detection units"
  );
  text = replaceOnce(
    text,
    `      armies: armies.map(({ item, state }) => ({ id: item.id, sideId: state.sideId })),`,
    `      armies: activeLandArmies.map(({ item, state }) => ({ id: item.id, sideId: state.sideId })),`,
    "exclude embarked visibility inputs"
  );
  text = replaceOnce(
    text,
    `      scene,\n      armies,\n      barriers,\n      role,`,
    `      scene,\n      activeLandArmies,\n      barriers,\n      role,`,
    "exclude embarked overlays"
  );
  return text;
});

console.log("Stage 2 transport Task 5A patch applied");
