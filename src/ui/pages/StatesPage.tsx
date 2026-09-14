import { useEffect, useState, type FormEvent } from "react";
import type { Side, StateEntity } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

function StateCard({
  state,
  sides,
  onAction
}: {
  state: StateEntity;
  sides: readonly Side[];
  onAction(command: UiCommand): void;
}) {
  const [name, setName] = useState(state.name);
  const [color, setColor] = useState(state.color ?? "#607d8b");

  useEffect(() => {
    setName(state.name);
    setColor(state.color ?? "#607d8b");
  }, [state.name, state.color]);

  const members = sides.filter((side) => side.stateId === state.id);
  const trimmedName = name.trim();
  const detailsChanged = trimmedName !== state.name || color !== (state.color ?? "#607d8b");

  return (
    <article className="side-card" aria-label={`Государство ${state.name}`}>
      <header className="side-card-heading">
        <span className="color-dot" style={{ background: state.color }} />
        <div>
          <h3>{state.name}</h3>
          <p>{state.active ? "Активно" : "Неактивно"}</p>
        </div>
      </header>

      <label>
        Название
        <input
          aria-label={`Название государства ${state.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="color-field">
        Цвет
        <input
          aria-label={`Цвет государства ${state.name}`}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <button
        className="button"
        type="button"
        aria-label={`Сохранить государство ${state.name}`}
        disabled={!trimmedName || !detailsChanged}
        onClick={() => onAction({
          type: "UPDATE_STATE",
          stateId: state.id,
          patch: { name: trimmedName, color }
        })}
      >
        Сохранить
      </button>

      <label>
        Правящая фракция
        <select
          aria-label={`Правящая фракция ${state.name}`}
          value={state.rulingFactionId ?? ""}
          onChange={(event) => onAction({
            type: "UPDATE_STATE",
            stateId: state.id,
            patch: { rulingFactionId: event.target.value || null }
          })}
        >
          <option value="">Не назначена</option>
          {members.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          aria-label={`Активно ${state.name}`}
          checked={state.active}
          disabled={!state.rulingFactionId}
          onChange={(event) => onAction({
            type: "UPDATE_STATE",
            stateId: state.id,
            patch: { active: event.target.checked }
          })}
        />
        Активное государство
      </label>

      <button
        className="button danger subtle"
        type="button"
        aria-label={`Удалить государство ${state.name}`}
        onClick={() => onAction({ type: "DELETE_STATE", stateId: state.id })}
      >
        Удалить
      </button>
    </article>
  );
}

export function StatesPage({ states, sides, onAction, createId = () => crypto.randomUUID() }: {
  states: readonly StateEntity[];
  sides: readonly Side[];
  onAction(command: UiCommand): void;
  createId?: () => string;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#607d8b");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    onAction({
      type: "CREATE_STATE",
      state: {
        id: createId(),
        name: value,
        color,
        rulingFactionId: null,
        active: false
      }
    });
    setName("");
  };

  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Политическая карта</p>
          <h2>Государства</h2>
        </div>
      </div>

      <form className="side-create-form" onSubmit={submit}>
        <label>
          Название нового государства
          <input
            aria-label="Название нового государства"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="color-field">
          Цвет
          <input
            aria-label="Цвет нового государства"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <button className="button primary" type="submit" disabled={!name.trim()}>
          Добавить государство
        </button>
      </form>

      <div className="card-list side-list">
        {states.map((state) => (
          <StateCard key={state.id} state={state} sides={sides} onAction={onAction} />
        ))}
      </div>

      <div className="card-list side-list">
        {sides.map((side) => (
          <label className="side-card" key={side.id}>
            Государство фракции {side.name}
            <select
              aria-label={`Государство фракции ${side.name}`}
              value={side.stateId ?? ""}
              onChange={(event) => onAction({
                type: "SET_SIDE_STATE",
                sideId: side.id,
                stateId: event.target.value || null
              })}
            >
              <option value="">Без государства</option>
              {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
