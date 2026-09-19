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
  const [civilSourceStateId, setCivilSourceStateId] = useState(activeStates[0]?.id ?? "");
  const [civilRebelFactionId, setCivilRebelFactionId] = useState("");
  const [civilStateName, setCivilStateName] = useState("");
  const [civilStateColor, setCivilStateColor] = useState("#aa3344");

  const selectedSourceStateId = activeStates.some((state) => state.id === sourceStateId)
    ? sourceStateId
    : (activeStates[0]?.id ?? "");
  const capitals = cities.filter((city) => city.isCapital && city.recognizedStateId === selectedSourceStateId);
  const selectedCapitalCityId = capitals.some((city) => city.id === capitalCityId)
    ? capitalCityId
    : (capitals[0]?.id ?? "");
  const participantCandidates = sides.filter((side) => side.stateId === selectedSourceStateId);
  const selectedParticipants = participantCandidates.filter((side) => participantFactionIds.has(side.id));
  const canStart = Boolean(selectedSourceStateId && selectedCapitalCityId && selectedParticipants.length > 0);

  const selectedCivilSourceStateId = activeStates.some((state) => state.id === civilSourceStateId)
    ? civilSourceStateId
    : (activeStates[0]?.id ?? "");
  const civilSourceState = states.find((state) => state.id === selectedCivilSourceStateId);
  const civilFactionCandidates = sides.filter(
    (side) => side.stateId === selectedCivilSourceStateId && side.id !== civilSourceState?.rulingFactionId
  );
  const selectedCivilFactionId = civilFactionCandidates.some((side) => side.id === civilRebelFactionId)
    ? civilRebelFactionId
    : (civilFactionCandidates[0]?.id ?? "");
  const canStartCivilWar = Boolean(
    selectedCivilSourceStateId &&
    selectedCivilFactionId &&
    civilStateName.trim()
  );

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
              value={selectedSourceStateId}
              onChange={(event) => {
                setSourceStateId(event.target.value);
                setCapitalCityId("");
                setParticipantFactionIds(new Set());
              }}
            >
              {activeStates.length === 0
                ? <option value="">Нет активных государств</option>
                : activeStates.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
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
              sourceStateId: selectedSourceStateId,
              capitalCityId: selectedCapitalCityId,
              participantFactionIds: selectedParticipants.map((side) => side.id)
            });
            setParticipantFactionIds(new Set());
          }}
        >
          Запустить восстание
        </button>
      </div>

      <div className="settings-card" aria-label="Гражданский раскол">
        <h3>Оформить гражданский раскол</h3>
        <p className="helper-text">
          Новому государству переходят только целые города под влиянием выбранной фракции.
          Фактический военный контроль клеток не переписывается.
        </p>
        <div className="form-grid">
          <label>
            Государство-источник
            <select
              aria-label="Государство-источник раскола"
              value={selectedCivilSourceStateId}
              onChange={(event) => {
                setCivilSourceStateId(event.target.value);
                setCivilRebelFactionId("");
              }}
            >
              {activeStates.length === 0
                ? <option value="">Нет активных государств</option>
                : activeStates.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
          </label>
          <label>
            Повстанческая фракция
            <select
              aria-label="Повстанческая фракция"
              value={selectedCivilFactionId}
              onChange={(event) => setCivilRebelFactionId(event.target.value)}
            >
              {civilFactionCandidates.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
            </select>
          </label>
          <label>
            Название нового государства
            <input
              aria-label="Название нового государства после раскола"
              value={civilStateName}
              onChange={(event) => setCivilStateName(event.target.value)}
            />
          </label>
          <label>
            Цвет нового государства
            <input
              aria-label="Цвет нового государства после раскола"
              type="color"
              value={civilStateColor}
              onChange={(event) => setCivilStateColor(event.target.value)}
            />
          </label>
        </div>
        {civilFactionCandidates.length === 0 && (
          <small className="muted">Нет фракции, которую можно отделить от действующей правящей фракции.</small>
        )}
        <button
          className="button danger subtle"
          type="button"
          disabled={!canStartCivilWar}
          onClick={() => {
            if (!canStartCivilWar) return;
            onAction({
              type: "START_CIVIL_WAR",
              sourceStateId: selectedCivilSourceStateId,
              rebelFactionId: selectedCivilFactionId,
              newStateId: "state-" + crypto.randomUUID(),
              newStateName: civilStateName.trim(),
              newStateColor: civilStateColor
            });
          }}
        >
          Начать гражданскую войну
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
