import { useMemo, useState } from "react";
import type { Side, StateEntity, StrategicCity } from "../../shared/types";
import type { RebellionStatusView, UiCommand } from "../state/useExtensionState";

export function RebellionsPage({
  states,
  sides,
  cities,
  statuses,
  onAction
}: {
  states: readonly StateEntity[];
  sides: readonly Side[];
  cities: readonly StrategicCity[];
  statuses: readonly RebellionStatusView[];
  onAction(command: UiCommand): void;
}) {
  const activeStates = useMemo(() => states.filter((state) => state.active), [states]);
  const [sourceStateId, setSourceStateId] = useState(activeStates[0]?.id ?? "");
  const [capitalCityId, setCapitalCityId] = useState("");
  const [participantFactionIds, setParticipantFactionIds] = useState<Set<string>>(() => new Set());

  const capitals = cities.filter((city) => city.isCapital && city.recognizedStateId === sourceStateId);
  const selectedCapitalCityId = capitals.some((city) => city.id === capitalCityId)
    ? capitalCityId
    : (capitals[0]?.id ?? "");
  const participantCandidates = sides.filter((side) => side.stateId === sourceStateId);
  const selectedParticipants = participantCandidates.filter((side) => participantFactionIds.has(side.id));
  const canStart = Boolean(sourceStateId && selectedCapitalCityId && selectedParticipants.length > 0);

  return (
    <section aria-labelledby="rebellions-title">
      <div className="section-heading secondary-heading">
        <div>
          <p className="eyebrow">Внутренний конфликт</p>
          <h2 id="rebellions-title">Восстания</h2>
          <p className="page-description">Снимок территории фиксируется при запуске. Победитель автоматически не определяется.</p>
        </div>
      </div>

      <div className="settings-card">
        <h3>Запустить восстание</h3>
        <div className="form-grid">
          <label>
            Государство
            <select
              aria-label="Государство восстания"
              value={sourceStateId}
              onChange={(event) => {
                setSourceStateId(event.target.value);
                setCapitalCityId("");
                setParticipantFactionIds(new Set());
              }}
            >
              {activeStates.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
          </label>
          <label>
            Столица
            <select
              aria-label="Столица восстания"
              value={selectedCapitalCityId}
              onChange={(event) => setCapitalCityId(event.target.value)}
            >
              {capitals.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          </label>
        </div>

        <fieldset className="naval-request-participants">
          <legend>Участники</legend>
          {participantCandidates.map((side) => (
            <label key={side.id}>
              <input
                type="checkbox"
                aria-label={"Участник восстания: " + side.name}
                checked={participantFactionIds.has(side.id)}
                onChange={(event) => {
                  setParticipantFactionIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(side.id);
                    else next.delete(side.id);
                    return next;
                  });
                }}
              />
              <span>{side.name}</span>
            </label>
          ))}
          {participantCandidates.length === 0 && <small className="muted">В этом государстве нет фракций.</small>}
        </fieldset>

        <button
          className="button primary"
          type="button"
          disabled={!canStart}
          onClick={() => {
            if (!canStart) return;
            onAction({
              type: "START_REBELLION",
              rebellionId: "rebellion-" + crypto.randomUUID(),
              sourceStateId,
              capitalCityId: selectedCapitalCityId,
              participantFactionIds: selectedParticipants.map((side) => side.id)
            });
            setParticipantFactionIds(new Set());
          }}
        >
          Запустить восстание
        </button>
      </div>

      <div className="card-list">
        {statuses.map((status) => (
          <article className="army-card wiki-card" key={status.id}>
            <div className="army-card-heading">
              <div className="army-identity">
                <h3>{status.sourceStateName}</h3>
                <p>Столица: {status.capitalCityName} · снимок: {status.territoryCellCount} клеток · ход {status.startedOnTurn}</p>
              </div>
              <span className={status.active ? "status status-war" : "status"}>{status.active ? "Активно" : "Завершено"}</span>
            </div>
            <p>
              Контроль столицы: <strong>{status.capitalControllerFactionName ?? "спорный / отсутствует"}</strong>
            </p>
            <div className="battle-participants" aria-label={"Силы восстания " + status.id}>
              {status.participants.map((participant) => (
                <div className="battle-participant-row" key={participant.factionId}>
                  <div>
                    <strong>{participant.factionName}</strong>
                    <span>Армий в снимке: {participant.armyCount}</span>
                  </div>
                  <strong>♥ {participant.currentHp} / {participant.maxHp}</strong>
                </div>
              ))}
            </div>
            {status.active && (
              <div className="card-actions">
                <button
                  className="button danger subtle"
                  type="button"
                  onClick={() => onAction({ type: "CLOSE_REBELLION", rebellionId: status.id })}
                >
                  Завершить восстание
                </button>
              </div>
            )}
          </article>
        ))}
        {statuses.length === 0 && <p className="empty empty-panel">Восстаний пока нет.</p>}
      </div>
    </section>
  );
}
