import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `import type { ArmyView, NavalRequestTargetView, ShipView, UiCommand } from "../state/useExtensionState";`,
  `import type { ArmyView, NavalRequestTargetView, ShipView, TransportEmbarkTargetView, UiCommand } from "../state/useExtensionState";`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `  leaderSideIds,\n  navalRequestTargets = [],\n  onAction`,
  `  leaderSideIds,\n  navalRequestTargets = [],\n  transportEmbarkTargets = [],\n  onAction`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `  leaderSideIds: ReadonlySet<string>;\n  navalRequestTargets?: readonly NavalRequestTargetView[];\n  onAction(command: UiCommand): void;`,
  `  leaderSideIds: ReadonlySet<string>;\n  navalRequestTargets?: readonly NavalRequestTargetView[];\n  transportEmbarkTargets?: readonly TransportEmbarkTargetView[];\n  onAction(command: UiCommand): void;`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `  const [requestInitiatingShipId, setRequestInitiatingShipId] = useState("");\n  const [requestTargetShipId, setRequestTargetShipId] = useState("");`,
  `  const [requestInitiatingShipId, setRequestInitiatingShipId] = useState("");\n  const [requestTargetShipId, setRequestTargetShipId] = useState("");\n  const [embarkShipId, setEmbarkShipId] = useState("");\n  const [embarkArmyId, setEmbarkArmyId] = useState("");`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `  const canRequestNavalBattle = selectedRequestInitiatingShipId !== "" && selectedRequestTargetShipId !== "";`,
  `  const canRequestNavalBattle = selectedRequestInitiatingShipId !== "" && selectedRequestTargetShipId !== "";\n  const embarkTransports = ships.filter((ship) =>\n    ship.classId === "TRANSPORT" &&\n    ship.status === "READY" &&\n    ship.hp > 0 &&\n    ship.embarkedArmyId === null &&\n    ship.movementRemaining > 0 &&\n    (role === "GM" || leaderSideIds.has(ship.sideId))\n  );\n  const ownEmbarkTargets = armies\n    .filter((army) =>\n      army.healthHp > 0 &&\n      army.embarkedOnShipId == null &&\n      (role === "GM" || leaderSideIds.has(army.sideId))\n    )\n    .map((army) => ({ id: army.id, name: army.name, sideId: army.sideId, sideName: army.sideName }));\n  const embarkTargetById = new Map([\n    ...ownEmbarkTargets.map((target) => [target.id, target] as const),\n    ...transportEmbarkTargets.map((target) => [target.id, target] as const)\n  ]);\n  const embarkTargets = [...embarkTargetById.values()];\n  const selectedEmbarkShipId = embarkTransports.some((ship) => ship.id === embarkShipId)\n    ? embarkShipId\n    : (embarkTransports[0]?.id ?? "");\n  const selectedEmbarkArmyId = embarkTargets.some((army) => army.id === embarkArmyId)\n    ? embarkArmyId\n    : (embarkTargets[0]?.id ?? "");\n  const canEmbark = selectedEmbarkShipId !== "" && selectedEmbarkArmyId !== "";`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `      {role === "GM" && (\n        <section className="registration-card fleet-registration" aria-label="Регистрация корабля">`,
  `      {embarkTransports.length > 0 && (\n        <section className="registration-card fleet-registration" aria-labelledby="transport-embark-title">\n          <div className="registration-copy">\n            <span className="registration-kicker">Перевозка войск</span>\n            <h3 id="transport-embark-title">Погрузка армии</h3>\n            <small>Выберите свободный транспорт и армию. Для иностранной армии потребуется подтверждение её лидера.</small>\n          </div>\n          <div className="registration-actions fleet-registration-actions">\n            <select\n              aria-label="Транспорт для погрузки"\n              value={selectedEmbarkShipId}\n              onChange={(event) => setEmbarkShipId(event.target.value)}\n            >\n              {embarkTransports.map((ship) => <option key={ship.id} value={ship.id}>{ship.name} — {ship.sideName}</option>)}\n            </select>\n            <select\n              aria-label="Армия для погрузки"\n              value={selectedEmbarkArmyId}\n              disabled={embarkTargets.length === 0}\n              onChange={(event) => setEmbarkArmyId(event.target.value)}\n            >\n              {embarkTargets.length === 0 && <option value="">Доступных армий нет</option>}\n              {embarkTargets.map((army) => <option key={army.id} value={army.id}>{army.name} — {army.sideName}</option>)}\n            </select>\n            <button\n              className="button primary"\n              type="button"\n              disabled={!canEmbark}\n              onClick={() => {\n                if (!canEmbark) return;\n                onAction({ type: "EMBARK_ARMY", shipId: selectedEmbarkShipId, armyId: selectedEmbarkArmyId });\n              }}\n            >\n              Погрузить армию\n            </button>\n          </div>\n        </section>\n      )}\n\n      {role === "GM" && (\n        <section className="registration-card fleet-registration" aria-label="Регистрация корабля">`
);

replaceOnce(
  "src/ui/pages/ArmiesPage.tsx",
  `import type { ArmyView, UiCommand } from "../state/useExtensionState";`,
  `import type { ArmyView, TransportEmbarkRequestView, UiCommand } from "../state/useExtensionState";`
);

replaceOnce(
  "src/ui/pages/ArmiesPage.tsx",
  `  memberSideIds: ReadonlySet<string>;\n  onAction(command: UiCommand): void;`,
  `  memberSideIds: ReadonlySet<string>;\n  pendingTransportEmbarkRequests?: readonly TransportEmbarkRequestView[];\n  onAction(command: UiCommand): void;`
);

replaceOnce(
  "src/ui/pages/ArmiesPage.tsx",
  `  leaderSideIds,\n  memberSideIds,\n  onAction`,
  `  leaderSideIds,\n  memberSideIds,\n  pendingTransportEmbarkRequests = [],\n  onAction`
);

replaceOnce(
  "src/ui/pages/ArmiesPage.tsx",
  `      <div className="card-list army-list">`,
  `      {pendingTransportEmbarkRequests.length > 0 && (\n        <section className="registration-card" aria-labelledby="transport-consent-title">\n          <div className="registration-copy">\n            <span className="registration-kicker">Перевозка войск</span>\n            <h3 id="transport-consent-title">Запросы на перевозку</h3>\n            <small>Иностранный транспорт ожидает согласия на погрузку вашей армии.</small>\n          </div>\n          <div className="registration-actions">\n            {pendingTransportEmbarkRequests.map((request) => (\n              <div key={request.id} className="transport-consent-request">\n                <span>{request.armyName} → {request.shipName} · {request.shipSideName}</span>\n                <button\n                  className="button primary"\n                  type="button"\n                  aria-label={\`Разрешить погрузку \${request.armyName} на \${request.shipName}\`}\n                  onClick={() => onAction({\n                    type: "ACCEPT_EMBARK_ARMY",\n                    embarkRequestId: request.id,\n                    shipId: request.shipId,\n                    armyId: request.armyId\n                  })}\n                >\n                  Разрешить погрузку\n                </button>\n              </div>\n            ))}\n          </div>\n        </section>\n      )}\n\n      <div className="card-list army-list">`
);

replaceOnce(
  "src/ui/pages/ForcesPage.tsx",
  `import type { ArmyView, NavalRequestTargetView, ShipView, UiCommand } from "../state/useExtensionState";`,
  `import type { ArmyView, NavalRequestTargetView, ShipView, TransportEmbarkRequestView, TransportEmbarkTargetView, UiCommand } from "../state/useExtensionState";`
);

replaceOnce(
  "src/ui/pages/ForcesPage.tsx",
  `  memberSideIds,\n  navalRequestTargets = [],\n  onAction`,
  `  memberSideIds,\n  navalRequestTargets = [],\n  transportEmbarkTargets = [],\n  pendingTransportEmbarkRequests = [],\n  onAction`
);

replaceOnce(
  "src/ui/pages/ForcesPage.tsx",
  `  navalRequestTargets?: readonly NavalRequestTargetView[];\n  onAction(command: UiCommand): void;`,
  `  navalRequestTargets?: readonly NavalRequestTargetView[];\n  transportEmbarkTargets?: readonly TransportEmbarkTargetView[];\n  pendingTransportEmbarkRequests?: readonly TransportEmbarkRequestView[];\n  onAction(command: UiCommand): void;`
);

replaceOnce(
  "src/ui/pages/ForcesPage.tsx",
  `          memberSideIds={memberSideIds}\n          onAction={onAction}`,
  `          memberSideIds={memberSideIds}\n          pendingTransportEmbarkRequests={pendingTransportEmbarkRequests}\n          onAction={onAction}`
);

replaceOnce(
  "src/ui/pages/ForcesPage.tsx",
  `          navalRequestTargets={navalRequestTargets}\n          onAction={onAction}`,
  `          navalRequestTargets={navalRequestTargets}\n          transportEmbarkTargets={transportEmbarkTargets}\n          onAction={onAction}`
);

replaceOnce(
  "src/ui/App.tsx",
  `leaderSideIds={state.leaderSideIds} memberSideIds={state.memberSideIds} navalRequestTargets={state.navalRequestTargets} onAction={send}`,
  `leaderSideIds={state.leaderSideIds} memberSideIds={state.memberSideIds} navalRequestTargets={state.navalRequestTargets} transportEmbarkTargets={state.transportEmbarkTargets} pendingTransportEmbarkRequests={state.pendingTransportEmbarkRequests} onAction={send}`
);
