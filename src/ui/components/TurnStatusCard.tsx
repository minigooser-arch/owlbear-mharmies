import { useEffect, useState } from "react";
import type { TurnState } from "../../shared/types";
import type { TurnBlocker } from "../../turns/turnCompletionGuard";
import type { TurnFailureDiagnostic } from "../../turns/turnFailureDiagnostic";
import { moscowLocalInputToIso, turnStatusPresentation } from "../presentation/turns";
import type { UiCommand } from "../state/useExtensionState";

export function TurnStatusCard({
  turn,
  role,
  onAction,
  now = new Date(),
  battleCount = 0,
  navalBattleActive = false,
  navalRequestCount = 0,
  turnCompletionBlockers,
  pendingTurnArmyNames = [],
  turnFailureDiagnostic
}: {
  turn: TurnState;
  role: "GM" | "PLAYER";
  onAction(command: UiCommand): void;
  now?: Date;
  battleCount?: number;
  navalBattleActive?: boolean;
  navalRequestCount?: number;
  /** Exact server-side blockers, provided only to GM. */
  turnCompletionBlockers?: readonly TurnBlocker[];
  pendingTurnArmyNames?: readonly string[];
  turnFailureDiagnostic?: TurnFailureDiagnostic;
}) {
  const [deferValue, setDeferValue] = useState("");
  const [turnNumberValue, setTurnNumberValue] = useState(String(turn.turnNumber));
  useEffect(() => setTurnNumberValue(String(turn.turnNumber)), [turn.turnNumber]);
  const presentation = turnStatusPresentation(turn, now);
  const defer = () => {
    const until = moscowLocalInputToIso(deferValue);
    if (until) onAction({ type: "DEFER_TURN", until });
  };
  const parsedTurnNumber = Number(turnNumberValue);
  const validTurnNumber = Number.isInteger(parsedTurnNumber) && parsedTurnNumber >= 1;
  const blockingReasons = (turnCompletionBlockers ?? []).map((blocker) => {
    switch (blocker) {
      case "LAND_BATTLE_ACTIVE": return `Незавершённые сухопутные бои: ${battleCount}.`;
      case "NAVAL_BATTLE_ACTIVE": return navalBattleActive ? "Активный морской бой." : "Морской бой не завершён.";
      case "NAVAL_REQUESTS_PENDING": return `Необработанные заявки на морской бой: ${navalRequestCount}.`;
      case "MOVEMENT_RESOLUTION_PENDING": return pendingTurnArmyNames.length > 0
        ? `Не завершили движение: ${pendingTurnArmyNames.join(", ")}.`
        : "Фаза перемещения ещё не завершена.";
      default: return `Ожидается контрольная операция: ${blocker}.`;
    }
  });

  return (
    <article className={`turn-card turn-${presentation.kind.toLowerCase()}`}>
      <div className="turn-card-heading">
        <div><p className="eyebrow">Игровое время</p><h3>{presentation.title}</h3></div>
        <span className="turn-status">{presentation.status}</span>
      </div>

      {role === "GM" && (
        <div className="turn-admin">
          <div className="turn-actions">
            <button className="button primary" type="button"
              disabled={Boolean(turn.completionPending)}
              onClick={() => onAction({ type: "COMPLETE_TURN_NOW" })}>
              {turn.completionPending ? "Завершение хода выполняется…" : "Завершить ход"}
            </button>
            {turn.completionPending && <div role="status">
              <p>Ожидаем завершения перемещения и обязательных боёв. Новый ход начнётся автоматически.</p>
              {role === "GM" && turnFailureDiagnostic?.turnNumber === turn.turnNumber && (
                <p>Последняя ошибка завершения хода: этап {turnFailureDiagnostic.stage}, код {turnFailureDiagnostic.code}. Время: {new Date(turnFailureDiagnostic.at).toLocaleTimeString("ru-RU")}.</p>
              )}
              {role === "GM" && turnCompletionBlockers && (
                blockingReasons.length > 0
                  ? <p>Сейчас блокируют ход: {blockingReasons.join(" ")}</p>
                  : <p>Игровых блокировок в текущей сцене нет. Если ход не меняется, проверьте активность GM-координатора и ошибки фонового процесса, в частности доступность Google Sheets.</p>
              )}
            </div>}
            {turn.autoTurnsPaused && <button type="button" onClick={() => onAction({ type: "RESUME_AUTO_TURNS" })}>Возобновить ходы</button>}
          </div>
          <details className="turn-more">
            <summary>Настройки хода</summary>
            <div className="turn-more-content">
              <div className="turn-defer-row">
                <label>Номер хода<input aria-label="Номер хода" type="number" min="1" step="1" value={turnNumberValue} onChange={(event) => setTurnNumberValue(event.target.value)} /></label>
                <button type="button" disabled={!validTurnNumber || parsedTurnNumber === turn.turnNumber || turn.phase !== "MOVEMENT"} onClick={() => onAction({ type: "SET_TURN_NUMBER", turnNumber: parsedTurnNumber })}>Установить номер хода</button>
              </div>
              {!turn.autoTurnsPaused && (
                <>
                  <div className="turn-actions">
                    <button type="button" onClick={() => onAction({ type: "PAUSE_AUTO_TURNS" })}>Остановить ходы</button>
                    {turn.deferredUntil && <button type="button" onClick={() => onAction({ type: "CANCEL_TURN_DEFERRAL" })}>Отменить перенос</button>}
                  </div>
                  <div className="turn-defer-row">
                    <label>Новая дата и время (МСК)<input aria-label="Новая дата и время (МСК)" type="datetime-local" value={deferValue} onChange={(event) => setDeferValue(event.target.value)} /></label>
                    <button type="button" disabled={!moscowLocalInputToIso(deferValue)} onClick={defer}>Отложить ход</button>
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      )}
    </article>
  );
}
