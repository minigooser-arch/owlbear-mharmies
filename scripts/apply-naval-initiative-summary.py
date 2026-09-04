from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected anchor once, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/ui/state/useExtensionState.ts",
    '''export interface NavalBattleView {\n  id: string;\n  roundNumber: number;\n  participantCount: number;\n  currentShipId: string | null;\n}\n''',
    '''export interface NavalBattleView {\n  id: string;\n  roundNumber: number;\n  participantCount: number;\n  currentShipId: string | null;\n  initiative?: Array<{ shipId: string; total: number }>;\n  completedShipIdsThisRound?: string[];\n  exitedShipIds?: string[];\n}\n'''
)

replace_once(
    "src/owlbear/extensionServices.ts",
    '''        participantCount: input.scene.activeNavalBattle.participantShipIds.length,\n        currentShipId: input.scene.activeNavalBattle.currentShipId\n''',
    '''        participantCount: input.scene.activeNavalBattle.participantShipIds.length,\n        currentShipId: input.scene.activeNavalBattle.currentShipId,\n        initiative: input.scene.activeNavalBattle.initiative.map(({ shipId, total }) => ({ shipId, total })),\n        completedShipIdsThisRound: [...input.scene.activeNavalBattle.completedShipIdsThisRound],\n        exitedShipIds: [...input.scene.activeNavalBattle.exitedShipIds]\n'''
)

replace_once(
    "src/ui/pages/BattlesPage.tsx",
    '''  const currentShip = battle.currentShipId\n    ? ships.find((ship) => ship.id === battle.currentShipId)\n    : ships.find((ship) => ship.isCurrentNavalTurn);\n\n  return (\n''',
    '''  const currentShip = battle.currentShipId\n    ? ships.find((ship) => ship.id === battle.currentShipId)\n    : ships.find((ship) => ship.isCurrentNavalTurn);\n  const shipById = new Map(ships.map((ship) => [ship.id, ship]));\n  const completedShipIds = new Set(battle.completedShipIdsThisRound ?? []);\n  const exitedShipIds = new Set(battle.exitedShipIds ?? []);\n  const initiative = battle.initiative ?? [];\n\n  return (\n'''
)

replace_once(
    "src/ui/pages/BattlesPage.tsx",
    '''      <div className="battle-participants" aria-label="Состояние морского боя">\n        <p>Раунд: {battle.roundNumber}</p>\n        <p>Кораблей: {battle.participantCount}</p>\n        <p>Ход: {currentShip?.name ?? "—"}</p>\n      </div>\n      <p className="muted">Завершение вручную вернёт зарегистрированные корабли на стратегические позиции и курсы, сохранённые при начале боя.</p>\n''',
    '''      <div className="battle-participants" aria-label="Состояние морского боя">\n        <p>Раунд: {battle.roundNumber}</p>\n        <p>Кораблей: {battle.participantCount}</p>\n        <p>Ход: {currentShip?.name ?? "—"}</p>\n      </div>\n      {initiative.length > 0 && (\n        <ol className="battle-participants naval-initiative-list" aria-label="Порядок инициативы">\n          {initiative.map((entry, index) => {\n            const ship = shipById.get(entry.shipId);\n            const status = exitedShipIds.has(entry.shipId)\n              ? "Вышел"\n              : battle.currentShipId === entry.shipId\n                ? "Ход"\n                : completedShipIds.has(entry.shipId)\n                  ? "Ход завершён"\n                  : "Ожидает";\n            return (\n              <li className="battle-participant-row" key={entry.shipId}>\n                <div><strong>{index + 1}. {ship?.name ?? entry.shipId}</strong><span>{status}</span></div>\n                <strong>{entry.total}</strong>\n              </li>\n            );\n          })}\n        </ol>\n      )}\n      <p className="muted">Завершение вручную вернёт зарегистрированные корабли на стратегические позиции и курсы, сохранённые при начале боя.</p>\n'''
)
