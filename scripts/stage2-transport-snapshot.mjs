import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}
function once(text, search, replacement, label) {
  const i = text.indexOf(search);
  if (i < 0) throw new Error(`Missing anchor: ${label}`);
  if (text.indexOf(search, i + search.length) >= 0) throw new Error(`Duplicate anchor: ${label}`);
  return text.slice(0, i) + replacement + text.slice(i + search.length);
}

patch("src/ui/state/useExtensionState.ts", (text) => {
  text = once(text,
`  disbandPending: boolean;\n}\n\nexport interface ShipView`,
`  disbandPending: boolean;\n  embarkedOnShipId: string | null;\n}\n\nexport interface ShipView`,
"army embarked view");
  text = once(text,
`export interface NavalRequestTargetView {\n`,
`export interface TransportEmbarkTargetView {\n  id: string;\n  name: string;\n  sideId: string;\n  sideName: string;\n}\n\nexport interface PendingTransportEmbarkRequestView {\n  id: string;\n  shipId: string;\n  shipName: string;\n  shipSideId: string;\n  shipSideName: string;\n  armyId: string;\n  armyName: string;\n}\n\nexport interface NavalRequestTargetView {\n`,
"transport view interfaces");
  text = once(text,
`  ships?: readonly ShipView[];\n  navalRequestTargets?: readonly NavalRequestTargetView[];`,
`  ships?: readonly ShipView[];\n  transportEmbarkTargets?: readonly TransportEmbarkTargetView[];\n  pendingTransportEmbarkRequests?: readonly PendingTransportEmbarkRequestView[];\n  navalRequestTargets?: readonly NavalRequestTargetView[];`,
"raw transport fields");
  text = once(text,
`  ships: ShipView[];\n  navalRequestTargets: NavalRequestTargetView[];`,
`  ships: ShipView[];\n  transportEmbarkTargets: TransportEmbarkTargetView[];\n  pendingTransportEmbarkRequests: PendingTransportEmbarkRequestView[];\n  navalRequestTargets: NavalRequestTargetView[];`,
"vm transport fields");
  text = once(text,
`      ships,\n      navalRequestTargets: [...(snapshot.navalRequestTargets ?? [])],`,
`      ships,\n      transportEmbarkTargets: [...(snapshot.transportEmbarkTargets ?? [])],\n      pendingTransportEmbarkRequests: [...(snapshot.pendingTransportEmbarkRequests ?? [])],\n      navalRequestTargets: [...(snapshot.navalRequestTargets ?? [])],`,
"vm transport normalization");
  return text;
});

patch("src/owlbear/extensionServices.ts", (text) => {
  text = once(text,
`  NavalBattleRequestView,\n  NavalRequestTargetView,`,
`  NavalBattleRequestView,\n  NavalRequestTargetView,\n  PendingTransportEmbarkRequestView,\n  TransportEmbarkTargetView,`,
"transport type imports");
  text = once(text,
`  const mapVisibleSourceIds = new Set(input.mapVisibleSourceIds);\n  for (const army of input.armies) {\n    if (input.role === "GM" || memberSideIds.has(army.state.sideId)) {\n      mapVisibleSourceIds.add(army.item.id);\n    }\n  }`,
`  const shipById = new Map(shipRecords.map((record) => [record.item.id, record.state]));\n  const reciprocallyEmbarkedArmyIds = new Set(\n    input.armies\n      .filter(({ item, state }) => {\n        if (state.embarkedOnShipId == null) return false;\n        return shipById.get(state.embarkedOnShipId)?.embarkedArmyId === item.id;\n      })\n      .map(({ item }) => item.id)\n  );\n  const mapVisibleSourceIds = new Set(\n    [...input.mapVisibleSourceIds].filter((id) => !reciprocallyEmbarkedArmyIds.has(id))\n  );\n  for (const army of input.armies) {\n    if (\n      !reciprocallyEmbarkedArmyIds.has(army.item.id) &&\n      (input.role === "GM" || memberSideIds.has(army.state.sideId))\n    ) {\n      mapVisibleSourceIds.add(army.item.id);\n    }\n  }`,
"embarked map visibility");
  text = once(text,
`  const sideNames = new Map(input.scene.sides.map((side) => [side.id, side.name]));\n  const navalRequestTargets: NavalRequestTargetView[]`,
`  const sideNames = new Map(input.scene.sides.map((side) => [side.id, side.name]));\n  const armyById = new Map(input.armies.map((record) => [record.item.id, record]));\n  const shipRecordById = new Map(shipRecords.map((record) => [record.item.id, record]));\n  const transportEmbarkTargets: TransportEmbarkTargetView[] = input.role === "PLAYER" && leaderSideIds.size > 0\n    ? input.armies\n        .filter(({ item, state }) =>\n          state.health.hp > 0 &&\n          state.embarkedOnShipId == null &&\n          !memberSideIds.has(state.sideId) &&\n          mapVisibleSourceIds.has(item.id)\n        )\n        .map(({ item, state }) => ({\n          id: item.id,\n          name: item.name ?? "Безымянная армия",\n          sideId: state.sideId,\n          sideName: sideNames.get(state.sideId) ?? "Неизвестная сторона"\n        }))\n    : [];\n  const pendingTransportEmbarkRequests: PendingTransportEmbarkRequestView[] = (input.scene.transportEmbarkRequests ?? [])\n    .flatMap((request) => {\n      const armyRecord = armyById.get(request.armyId);\n      const shipRecord = shipRecordById.get(request.shipId);\n      if (!armyRecord || !shipRecord) return [];\n      const canSee = input.role === "GM" || leaderSideIds.has(armyRecord.state.sideId);\n      if (!canSee) return [];\n      return [{\n        id: request.id,\n        shipId: request.shipId,\n        shipName: shipRecord.item.name ?? "Безымянный корабль",\n        shipSideId: shipRecord.state.sideId,\n        shipSideName: sideNames.get(shipRecord.state.sideId) ?? "Неизвестная сторона",\n        armyId: request.armyId,\n        armyName: armyRecord.item.name ?? "Безымянная армия"\n      }];\n    });\n  const navalRequestTargets: NavalRequestTargetView[]`,
"transport snapshot construction");
  text = once(text,
`      disbandPending: state.disband.pending\n    };`,
`      disbandPending: state.disband.pending,\n      embarkedOnShipId: state.embarkedOnShipId ?? null\n    };`,
"army cargo link");
  text = once(text,
`    ships,\n    navalRequestTargets,`,
`    ships,\n    transportEmbarkTargets,\n    pendingTransportEmbarkRequests,\n    navalRequestTargets,`,
"snapshot transport output");
  text = once(text,
`  ships: [],\n  navalRequestTargets: [],`,
`  ships: [],\n  transportEmbarkTargets: [],\n  pendingTransportEmbarkRequests: [],\n  navalRequestTargets: [],`,
"loading snapshot transport arrays");
  return text;
});

console.log("transport snapshot patch applied");
