import { useState } from "react";
import type { Side, StateEntity, WarState } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

function names(ids: readonly string[], items: readonly { id: string; name: string }[], fallback: string): string {
  const byId = new Map(items.map((item) => [item.id, item.name]));
  return ids.map((id) => byId.get(id) ?? fallback).join(", ");
}

function toggleSet(setter: (update: (current: Set<string>) => Set<string>) => void, id: string): void {
  setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
}

function WarEditor({ war, sides, states, onAction }: { war: WarState; sides: readonly Side[]; states: readonly StateEntity[]; onAction(command: UiCommand): void }) {
  const [name, setName] = useState(war.name);
  const [factions, setFactions] = useState<Set<string>>(() => new Set(war.participantFactionIds));
  const [stateIds, setStateIds] = useState<Set<string>>(() => new Set(war.participantStateIds));
  return <article className="war-card">
    <div className="war-card-heading"><div><h3>{war.name}</h3><p>Фракции: {names(war.participantFactionIds, sides, "Неизвестная фракция") || "—"}</p><p>Государства: {names(war.participantStateIds, states, "Неизвестное государство") || "—"}</p></div><span className={`status ${war.active ? "status-moving" : ""}`}>{war.active ? "Активна" : "Завершена"}</span></div>
    {war.active && <>
      <label className="war-name-field">Название<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <h4>Фракции</h4><div className="checkbox-list" aria-label={`Фракции ${war.name}`}>{sides.map((side) => <label key={side.id}><input type="checkbox" checked={factions.has(side.id)} onChange={() => toggleSet(setFactions, side.id)} />{side.name}</label>)}</div>
      <h4>Государства</h4><div className="checkbox-list" aria-label={`Государства ${war.name}`}>{states.filter((item) => item.active).map((item) => <label key={item.id}><input type="checkbox" checked={stateIds.has(item.id)} onChange={() => toggleSet(setStateIds, item.id)} />{item.name}</label>)}</div>
      <div className="card-actions"><button type="button" disabled={!name.trim() || (factions.size < 2 && stateIds.size < 2)} onClick={() => onAction({ type: "UPDATE_WAR", warId: war.id, patch: { name: name.trim(), participantFactionIds: [...factions], participantStateIds: [...stateIds] } })}>Сохранить изменения</button><button className="button danger subtle" type="button" onClick={() => onAction({ type: "END_WAR", warId: war.id })}>Завершить войну</button></div>
    </>}
  </article>;
}

export function WarsPage({ wars, sides, states, onAction }: { wars: readonly WarState[]; sides: readonly Side[]; states: readonly StateEntity[]; onAction(command: UiCommand): void }) {
  const [name, setName] = useState("");
  const [factions, setFactions] = useState<Set<string>>(new Set());
  const [stateIds, setStateIds] = useState<Set<string>>(new Set());
  const canCreate = name.trim().length > 0 && (factions.size >= 2 || stateIds.size >= 2);
  return <section aria-labelledby="wars-title">
    <div className="section-heading"><div><p className="eyebrow">Правила границ</p><h2 id="wars-title">Войны</h2></div></div>
    <div className="settings-card war-create-card"><h3>Новая война</h3><p>Фракции определяют политические ограничения движения. Государства определяют военную аннексию и государственные границы.</p><label>Название<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <h4>Фракции</h4><div className="checkbox-list">{sides.map((side) => <label key={side.id}><input type="checkbox" checked={factions.has(side.id)} onChange={() => toggleSet(setFactions, side.id)} />{side.name}</label>)}</div>
      <h4>Государства</h4><div className="checkbox-list">{states.filter((item) => item.active).map((item) => <label key={item.id}><input type="checkbox" checked={stateIds.has(item.id)} onChange={() => toggleSet(setStateIds, item.id)} />{item.name}</label>)}</div>
      <button className="button primary" type="button" disabled={!canCreate} onClick={() => { onAction({ type: "CREATE_WAR", war: { id: `war-${crypto.randomUUID()}`, name: name.trim(), participantFactionIds: [...factions], participantStateIds: [...stateIds], active: true } }); setName(""); setFactions(new Set()); setStateIds(new Set()); }}>Создать войну</button>
    </div>
    <div className="card-list wars-list">{wars.map((war) => <WarEditor key={war.id} war={war} sides={sides} states={states} onAction={onAction} />)}{wars.length === 0 && <p className="empty">Активных и сохранённых войн пока нет.</p>}</div>
  </section>;
}
