import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/ui/state/useExtensionState.ts",
  `  navalActionUsed?: boolean;\n  navalExited?: boolean;\n}`,
  `  navalActionUsed?: boolean;\n  navalExited?: boolean;\n  hospitalSupportTargets?: Array<{\n    id: string;\n    name: string;\n    sideId: string;\n    sideName: string;\n  }>;\n}`
);

replaceOnce(
  "src/owlbear/extensionServices.ts",
  `      : {};\n    return {\n      id: item.id,`,
  `      : {};\n    const hospitalSupportTargets =\n      battle?.status === "ACTIVE" &&\n      state.classId === "HOSPITAL" &&\n      state.hp > 0 &&\n      state.status === "IN_NAVAL_BATTLE" &&\n      state.battleId === battle.id &&\n      battle.currentShipId === item.id &&\n      !battle.actionUsedByShip[item.id] &&\n      (input.role === "GM" || leaderSideIds.has(state.sideId))\n        ? shipRecords\n            .filter(({ item: targetItem, state: targetState }) =>\n              targetItem.id !== item.id &&\n              battle.participantShipIds.includes(targetItem.id) &&\n              targetState.status === "IN_NAVAL_BATTLE" &&\n              targetState.battleId === battle.id &&\n              targetState.hp > 0 &&\n              !battle.exitedShipIds.includes(targetItem.id) &&\n              (input.role === "GM" || memberSideIds.has(targetState.sideId) || mapVisibleSourceIds.has(targetItem.id))\n            )\n            .map(({ item: targetItem, state: targetState }) => ({\n              id: targetItem.id,\n              name: targetItem.name ?? "Безымянный корабль",\n              sideId: targetState.sideId,\n              sideName: sideNames.get(targetState.sideId) ?? "Неизвестная сторона"\n            }))\n        : [];\n    return {\n      id: item.id,`
);

replaceOnce(
  "src/owlbear/extensionServices.ts",
  `      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,\n      ...tactical\n    };`,
  `      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,\n      hospitalSupportTargets,\n      ...tactical\n    };`
);

replaceOnce(
  "src/ui/components/ShipCard.tsx",
  `  const canConfirmExit = isGM && !destroyed && !exited && inBattle && ship.isCurrentNavalTurn === true;\n  const tacticalMovementDisabled =`,
  `  const canConfirmExit = isGM && !destroyed && !exited && inBattle && ship.isCurrentNavalTurn === true;\n  const hospitalSupportTargets = ship.hospitalSupportTargets ?? [];\n  const [hospitalTargetId, setHospitalTargetId] = useState("");\n  const selectedHospitalTargetId = hospitalSupportTargets.some((target) => target.id === hospitalTargetId)\n    ? hospitalTargetId\n    : (hospitalSupportTargets[0]?.id ?? "");\n  const canUseHospitalSupport =\n    canControlTactical &&\n    ship.classId === "HOSPITAL" &&\n    ship.navalActionUsed !== true &&\n    selectedHospitalTargetId !== "";\n  const tacticalMovementDisabled =`
);

replaceOnce(
  "src/ui/components/ShipCard.tsx",
  `          <button\n            className="button subtle wide"\n            type="button"\n            onClick={() => onAction({ type: "END_NAVAL_SHIP_TURN", shipId: ship.id })}\n          >\n            Завершить ход\n          </button>\n        </div>\n      )}`,
  `          {ship.classId === "HOSPITAL" && hospitalSupportTargets.length > 0 && (\n            <div className="ship-hospital-support" aria-label={\`Поддержка госпитального судна ${ship.name}\`}>\n              <select\n                aria-label={\`Цель госпитального судна ${ship.name}\`}\n                value={selectedHospitalTargetId}\n                onChange={(event) => setHospitalTargetId(event.target.value)}\n              >\n                {hospitalSupportTargets.map((target) => (\n                  <option key={target.id} value={target.id}>{target.name} — {target.sideName}</option>\n                ))}\n              </select>\n              <button\n                className="button primary wide"\n                type="button"\n                disabled={!canUseHospitalSupport}\n                onClick={() => {\n                  if (!canUseHospitalSupport) return;\n                  onAction({\n                    type: "NAVAL_HOSPITAL_SUPPORT",\n                    shipId: ship.id,\n                    targetShipId: selectedHospitalTargetId\n                  });\n                }}\n              >\n                Оказать поддержку (2d6)\n              </button>\n            </div>\n          )}\n          <button\n            className="button subtle wide"\n            type="button"\n            onClick={() => onAction({ type: "END_NAVAL_SHIP_TURN", shipId: ship.id })}\n          >\n            Завершить ход\n          </button>\n        </div>\n      )}`
);
