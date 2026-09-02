import { useState } from "react";
import type { TurnState } from "../../shared/types";
import { moscowLocalInputToIso, turnStatusPresentation } from "../presentation/turns";
import type { UiCommand } from "../state/useExtensionState";

export function TurnStatusCard({
  turn,
  role,
  onAction,
  now = new Date()
}: {
  turn: TurnState;
  role: "GM" | "PLAYER";
  onAction(command: UiCommand): void;
  now?: Date;
}) {
  const [deferValue, setDeferValue] = useState("");
  const presentation = turnStatusPresentation(turn, now);
  const defer = () => {
    const until = moscowLocalInputToIso(deferValue);
    if (until) onAction({ type: "DEFER_TURN", until });
  };

  return (
    <article className={`turn-card turn-${presentation.kind.toLowerCase()}`}>
      <div className="turn-card-heading">
        <div><p className="eyebrow">Игровое время</p><h3>{presentation.title}</h3></div>
        <span className="turn-status">{presentation.status}</span>
      </div>

      {role === "GM" && (
        <div className="turn-admin">
          <div className="turn-actions">
            <button className="button primary" type="button" onClick={() => onAction({ type: "COMPLETE_TURN_NOW" })}>Завершить ход сейчас</button>
            {turn.autoTurnsPaused && <button type="button" onClick={() => onAction({ type: "RESUME_AUTO_TURNS" })}>Возобновить ходы</button>}
          </div>
          {!turn.autoTurnsPaused && (
            <details className="turn-more">
              <summary>Настройки хода</summary>
              <div className="turn-more-content">
                <div className="turn-actions">
                  <button type="button" onClick={() => onAction({ type: "PAUSE_AUTO_TURNS" })}>Остановить ходы</button>
                  {turn.deferredUntil && <button type="button" onClick={() => onAction({ type: "CANCEL_TURN_DEFERRAL" })}>Отменить перенос</button>}
                </div>
                <div className="turn-defer-row">
                  <label>Новая дата и время (МСК)<input aria-label="Новая дата и время (МСК)" type="datetime-local" value={deferValue} onChange={(event) => setDeferValue(event.target.value)} /></label>
                  <button type="button" disabled={!moscowLocalInputToIso(deferValue)} onClick={defer}>Отложить ход</button>
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
