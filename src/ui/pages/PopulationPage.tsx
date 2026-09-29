import { useEffect, useState } from "react";
import type { ConscriptionLaw, SceneSettings, StateDemography, StateEntity } from "../../shared/types";
import type { PopulationSyncSummary } from "../../population/populationSheetSync";
import type { UiCommand } from "../state/useExtensionState";

interface PopulationPageProps {
  states: readonly StateEntity[];
  demographics: readonly StateDemography[];
  conscriptionLaws: readonly ConscriptionLaw[];
  onAction(command: UiCommand): void;
  settings?: SceneSettings;
  onSyncPopulation?: () => Promise<PopulationSyncSummary>;
}

type DemographyDraft = Pick<StateDemography, "population" | "populationGrowthFactor" | "humanResource" | "conscriptionLawId" | "conscriptionRate">;

function draftFor(record: StateDemography): DemographyDraft {
  return {
    population: record.population,
    populationGrowthFactor: record.populationGrowthFactor,
    humanResource: record.humanResource,
    conscriptionLawId: record.conscriptionLawId,
    conscriptionRate: record.conscriptionRate
  };
}

export function PopulationPage({ states, demographics, conscriptionLaws, onAction, settings, onSyncPopulation }: PopulationPageProps) {
  const [drafts, setDrafts] = useState<Record<string, DemographyDraft>>(() =>
    Object.fromEntries(demographics.map((record) => [record.stateId, draftFor(record)]))
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [lawDrafts, setLawDrafts] = useState<Record<string, ConscriptionLaw>>(() =>
    Object.fromEntries(conscriptionLaws.map((law) => [law.id, { ...law }]))
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  useEffect(() => {
    setDrafts(Object.fromEntries(demographics.map((record) => [record.stateId, draftFor(record)])));
  }, [demographics]);
  useEffect(() => {
    setLawDrafts(Object.fromEntries(conscriptionLaws.map((law) => [law.id, { ...law }])));
  }, [conscriptionLaws]);
  const stateNames = new Map(states.map((state) => [state.id, state.name]));
  const updateDraft = (record: StateDemography, patch: Partial<DemographyDraft>) => {
    setDrafts((current) => ({ ...current, [record.stateId]: { ...(current[record.stateId] ?? draftFor(record)), ...patch } }));
  };
  const submitRecord = (record: StateDemography) => {
    const reason = reasons[record.stateId]?.trim();
    if (!reason) return;
    const draft = drafts[record.stateId] ?? draftFor(record);
    onAction({ type: "UPDATE_STATE_DEMOGRAPHY", stateId: record.stateId, patch: draft, reason });
  };
  const syncPopulation = async () => {
    if (!onSyncPopulation || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await onSyncPopulation();
      const details = [
        `Обновлено записей: ${result.applied}`,
        `ЛР из таблицы: ${result.humanResourceApplied ?? 0}`,
        `Категорий призыва: ${result.conscriptionApplied}`,
        result.unmatchedStates.length > 0 ? `Без соответствия: ${result.unmatchedStates.length}` : "",
        (result.unmatchedConscriptionStates?.length ?? 0) > 0 ? `Без категории призыва: ${result.unmatchedConscriptionStates?.length}` : "",
        result.errors.length > 0 ? `Ошибки: ${result.errors.join(" · ")}` : ""
      ].filter(Boolean).join(" · ");
      setSyncMessage(details || "Синхронизация завершена");
    } catch (error) {
      setSyncMessage(`Синхронизация не выполнена: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section aria-labelledby="population-title">
      <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Экономика государств</p><h2 id="population-title">Население и ЛР</h2><p className="page-description">Google Sheets используется как источник населения и текущего ЛР. Все числовые значения населения и ЛР хранятся в тысячах человек: 46 084 = 46М 084Т. Изменения читаются из публичного CSV и применяются только мастером; запись обратно в таблицу не выполняется.</p></div></div>
      {onSyncPopulation && <div className="registration-card population-sync-card">
        <div className="registration-copy"><strong>Синхронизация с Google Sheets</strong><small>{settings?.populationSheetCsvUrl ?? "Адрес CSV населения не задан"}<br />{settings?.conscriptionSheetCsvUrl ?? "Адрес CSV призыва не задан"}</small></div>
        <button className="button primary" type="button" onClick={() => void syncPopulation()} disabled={syncing}>{syncing ? "Загрузка…" : "Синхронизировать с Google Sheets"}</button>
        {syncMessage && <p className="page-description" role="status">{syncMessage}</p>}
      </div>}
      <div className="management-stack">
        {demographics.length === 0 && <div className="empty-state">Демографических записей пока нет. Создайте их через корректировку государства.</div>}
        {states.filter((state) => !demographics.some((record) => record.stateId === state.id)).map((state) => {
          const law = conscriptionLaws.find((candidate) => candidate.active) ?? { id: "DEMILITARIZED", rate: 0 };
          return <div className="registration-card" key={`create-${state.id}`}><div className="registration-copy"><strong>{state.name}</strong><small>Для государства ещё нет внутренней записи.</small></div><button className="button primary" type="button" onClick={() => onAction({ type: "UPDATE_STATE_DEMOGRAPHY", stateId: state.id, patch: { population: 0, populationGrowthFactor: 1, humanResource: 0, conscriptionLawId: law.id, conscriptionRate: law.rate }, reason: "Создание демографической записи" })}>Создать запись</button></div>;
        })}
        {demographics.map((record) => {
          const draft = drafts[record.stateId] ?? draftFor(record);
          return (
            <form className="registration-card management-form" key={record.stateId} onSubmit={(event) => { event.preventDefault(); submitRecord(record); }}>
              <div className="registration-copy"><strong>{stateNames.get(record.stateId) ?? record.stateId}</strong><small>Максимум ЛР: {Math.round(record.humanResourceCapacity).toLocaleString("ru-RU")} тыс. · Последний расчёт: {record.lastPopulationCalculationDate ?? "не выполнялся"}</small></div>
              <div className="form-grid">
                <label>Население (тыс.)<input type="number" min="0" step="any" value={draft.population} onChange={(event) => updateDraft(record, { population: Number(event.target.value) })} /></label>
                <label>Коэффициент роста<input type="number" min="0.000001" step="0.000001" value={draft.populationGrowthFactor} onChange={(event) => updateDraft(record, { populationGrowthFactor: Number(event.target.value) })} /></label>
                <label>Текущий ЛР (тыс.)<input type="number" min="0" step="any" value={draft.humanResource} onChange={(event) => updateDraft(record, { humanResource: Number(event.target.value) })} /></label>
                <label>Закон о призыве<select value={draft.conscriptionLawId} onChange={(event) => { const law = conscriptionLaws.find((candidate) => candidate.id === event.target.value); updateDraft(record, { conscriptionLawId: event.target.value, ...(law ? { conscriptionRate: law.rate } : {}) }); }}><option value="">Выберите закон</option>{conscriptionLaws.map((law) => <option key={law.id} value={law.id}>{law.name} ({(law.rate * 100).toLocaleString("ru-RU")}%)</option>)}</select></label>
                <label>Ставка закона<input type="number" min="0" max="1" step="0.01" value={draft.conscriptionRate} onChange={(event) => updateDraft(record, { conscriptionRate: Number(event.target.value) })} /></label>
                <label>Причина изменения<input required value={reasons[record.stateId] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [record.stateId]: event.target.value }))} placeholder="Например, импорт из таблицы" /></label>
              </div>
              <button className="button primary" type="submit" disabled={!reasons[record.stateId]?.trim()}>Сохранить корректировку</button>
            </form>
          );
        })}
      </div>
      <div className="management-stack">
        <h3>Справочник законов о призыве</h3>
        {conscriptionLaws.map((law) => {
          const draft = lawDrafts[law.id] ?? law;
          return <form className="registration-card management-form" key={law.id} onSubmit={(event) => { event.preventDefault(); onAction({ type: "UPSERT_CONSCRIPTION_LAW", law: draft, reason: "Изменение закона мастером" }); }}><div className="form-grid"><label>Название<input value={draft.name} onChange={(event) => setLawDrafts((current) => ({ ...current, [law.id]: { ...draft, name: event.target.value } }))} /></label><label>Ставка<input type="number" min="0" max="1" step="0.01" value={draft.rate} onChange={(event) => setLawDrafts((current) => ({ ...current, [law.id]: { ...draft, rate: Number(event.target.value) } }))} /></label></div><button className="button subtle" type="submit">Обновить закон</button></form>;
        })}
      </div>
    </section>
  );
}
