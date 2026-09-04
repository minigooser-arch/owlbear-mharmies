from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

sea_terrain = '''    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: {
        ...structuredClone(DEFAULT_TERRAIN.types),
        sea: {
          id: "sea",
          name: "Море",
          movementCostUnits: 1,
          enabled: true,
          movementDomains: ["SEA"],
          blocksNavalLos: false
        }
      }
    },
    gridMap: { version: 1, revision: 0, cells: {} },'''

for path in [
    "src/commands/navalBattleStartCommands.test.ts",
    "src/background/navalBattleStartPersistenceIntegration.test.ts",
    "src/background/navalBattleRuntimeIntegration.test.ts",
]:
    replace_once(
        path,
        '    terrain: structuredClone(DEFAULT_TERRAIN),\n    gridMap: { version: 1, revision: 0, cells: {} },',
        sea_terrain
    )

replace_once(
    "src/ui/state/useExtensionState.ts",
    '  navalMovementRemaining?: number;\n  navalActionUsed?: boolean;\n}',
    '  navalMovementRemaining?: number;\n  navalActionUsed?: boolean;\n  navalExited?: boolean;\n}'
)

replace_once(
    "src/owlbear/extensionServices.ts",
    '      ? {\n          navalRoundNumber: battle.roundNumber,\n          isCurrentNavalTurn: battle.currentShipId === item.id,\n          navalMovementRemaining: battle.movementRemainingByShip[item.id] ?? 0,\n          navalActionUsed: battle.actionUsedByShip[item.id] ?? false\n        }',
    '      ? (() => {\n          const navalExited = battle.exitedShipIds.includes(item.id);\n          return {\n            navalRoundNumber: battle.roundNumber,\n            isCurrentNavalTurn: !navalExited && battle.currentShipId === item.id,\n            navalMovementRemaining: battle.movementRemainingByShip[item.id] ?? 0,\n            navalActionUsed: battle.actionUsedByShip[item.id] ?? false,\n            navalExited\n          };\n        })()'
)

replace_once(
    "src/ui/components/ShipCard.tsx",
    '  const destroyed = ship.hp <= 0;\n  const inBattle = ship.status === "IN_NAVAL_BATTLE";',
    '  const destroyed = ship.hp <= 0;\n  const exited = ship.navalExited === true;\n  const inBattle = ship.status === "IN_NAVAL_BATTLE";'
)
replace_once(
    "src/ui/components/ShipCard.tsx",
    '  const canControlTactical = canPlanRoute && !destroyed && inBattle && ship.isCurrentNavalTurn === true;\n  const tacticalMovementDisabled =',
    '  const canControlTactical = canPlanRoute && !destroyed && !exited && inBattle && ship.isCurrentNavalTurn === true;\n  const canConfirmExit = isGM && !destroyed && !exited && inBattle && ship.isCurrentNavalTurn === true;\n  const tacticalMovementDisabled ='
)
replace_once(
    "src/ui/components/ShipCard.tsx",
    '  const statusClass = destroyed\n    ? "status-destroyed"\n    : inBattle\n      ? "status-in_battle"\n      : "status-ready";\n  const statusText = destroyed\n    ? "Уничтожен"\n    : inBattle\n      ? "В морском бою"\n      : "Готов";',
    '  const statusClass = destroyed\n    ? "status-destroyed"\n    : exited\n      ? "status-exited"\n      : inBattle\n        ? "status-in_battle"\n        : "status-ready";\n  const statusText = destroyed\n    ? "Уничтожен"\n    : exited\n      ? "Вышел из боя"\n      : inBattle\n        ? "В морском бою"\n        : "Готов";'
)
replace_once(
    "src/ui/components/ShipCard.tsx",
    '      {canPlanRoute && (\n        <div className="card-actions ship-route-actions">',
    '      {canConfirmExit && (\n        <div className="card-actions ship-exit-actions">\n          <button\n            className="button subtle wide"\n            type="button"\n            onClick={() => onAction({ type: "CONFIRM_NAVAL_SHIP_EXIT", shipId: ship.id })}\n          >\n            Подтвердить выход из боя\n          </button>\n        </div>\n      )}\n\n      {canPlanRoute && (\n        <div className="card-actions ship-route-actions">'
)

replace_once(
    "src/ui/wiki-light.css",
    '.status-in_battle { border-color: #e9caca; background: var(--wiki-danger-soft); color: var(--wiki-danger); }\n.status-war',
    '.status-in_battle { border-color: #e9caca; background: var(--wiki-danger-soft); color: var(--wiki-danger); }\n.status-exited { border-color: #d6e4ec; background: #eef6fa; color: #4b7088; }\n.status-war'
)
