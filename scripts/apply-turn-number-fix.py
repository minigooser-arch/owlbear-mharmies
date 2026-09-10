from pathlib import Path

processor = Path("src/commands/commandProcessor.ts")
text = processor.read_text()
old_import = 'import { cancelTurnDeferral, completeTurn, deferTurn, pauseAutoTurns, resumeAutoTurns, setTurnNumber } from "../turns/turnService";'
new_import = 'import { canRenumberTurn, cancelTurnDeferral, completeTurn, deferTurn, pauseAutoTurns, renumberSceneTurn, resumeAutoTurns } from "../turns/turnService";'
assert old_import in text, "turnService import changed unexpectedly"
text = text.replace(old_import, new_import, 1)
old_case = '''      case "SET_TURN_NUMBER": {
        state.scene.turn = setTurnNumber(state.scene.turn, command.turnNumber);
        for (const [armyId, army] of Object.entries(state.armies)) {
          if (army.plannedRoute.executeOnTurn === 0 || army.plannedRoute.executeOnTurn === command.turnNumber) continue;
          state.armies[armyId] = bumpArmy(army, {
            plannedRoute: { ...army.plannedRoute, requiresReplan: true }
          });
        }
        return undefined;
      }'''
new_case = '''      case "SET_TURN_NUMBER": {
        if (!canRenumberTurn(state.scene)) {
          return state.scene.activeNavalBattle?.status === "ACTIVE"
            ? "NAVAL_BATTLE_ACTIVE"
            : "NOT_MOVEMENT_PHASE";
        }
        const renumbered = renumberSceneTurn(state.scene, state.armies, command.turnNumber);
        state.scene = renumbered.scene;
        state.armies = renumbered.armies;
        return undefined;
      }'''
assert old_case in text, "SET_TURN_NUMBER case changed unexpectedly"
processor.write_text(text.replace(old_case, new_case, 1))

card = Path("src/ui/components/TurnStatusCard.tsx")
text = card.read_text()
old = 'disabled={!validTurnNumber || parsedTurnNumber === turn.turnNumber}'
new = 'disabled={!validTurnNumber || parsedTurnNumber === turn.turnNumber || turn.phase !== "MOVEMENT"}'
assert old in text, "turn-number button changed unexpectedly"
card.write_text(text.replace(old, new, 1))

doc = Path("docs/manual-four-client-test.md")
text = doc.read_text().replace('версия `1.2.0`', 'версия `1.2.1`')
section = '''

## Ручная смена номера хода

1. В фазе `MOVEMENT` создайте у армии маршрут на следующий ход, а у корабля оставьте стратегический маршрут. Зафиксируйте действие корабля с ограничением раз за ход и временное раскрытие до следующего хода.
2. GM меняет номер текущего хода, например `26 → 1`.

Ожидание:

- номер текущего хода становится `1`;
- маршрут армии остаётся валидным и переносится с `27` на `2`, не требуя перепланирования только из-за смены номера;
- стратегический маршрут корабля сохраняется;
- отметки действий «раз за ход», снабжения, расформирования, ожидающих морских заявок и временного раскрытия сдвигаются на тот же относительный номер хода;
- обычные игроки не получают право менять номер хода.

3. Перейдите в `POST_MOVEMENT` и попробуйте изменить номер хода.

Ожидание: команда отклоняется; номер не меняется.

4. Запустите активный морской бой и попробуйте изменить номер хода.

Ожидание: команда отклоняется с защитой активного морского боя; состояние боя и номер хода не меняются.
'''
if "## Ручная смена номера хода" not in text:
    text += section
doc.write_text(text)
