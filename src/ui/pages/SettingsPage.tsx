import { useEffect, useState } from "react";
import type { SceneSettings } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function SettingsPage({ settings, onAction }: { settings: SceneSettings; onAction(command: UiCommand): void }) {
  const [populationSheetCsvUrl, setPopulationSheetCsvUrl] = useState(settings.populationSheetCsvUrl ?? "");
  useEffect(() => setPopulationSheetCsvUrl(settings.populationSheetCsvUrl ?? ""), [settings.populationSheetCsvUrl]);
  const updateNumber = (key: keyof SceneSettings, value: string) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) onAction({ type: "UPDATE_SETTINGS", settings: { [key]: numeric } });
  };
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Правила</p><h2>Настройки</h2></div></div>
      <div className="form-grid">
        <label>Дальность обнаружения<input type="number" min="0" value={settings.defaultDetectionRangeCells} onChange={(event) => updateNumber("defaultDetectionRangeCells", event.target.value)} /></label>
        <label>Комплектация армии, ЛР за HP<input type="number" min="0" value={settings.armyFormationCostPerHp ?? 5000} onChange={(event) => updateNumber("armyFormationCostPerHp", event.target.value)} /></label>
        <label>Обычное лечение, ЛР за HP<input type="number" min="0" value={settings.armyHealingCostPerHp ?? 5000} onChange={(event) => updateNumber("armyHealingCostPerHp", event.target.value)} /></label>
        <label>Лечение в госпитале, ЛР за HP<input type="number" min="0" value={settings.hospitalHealingCostPerHp ?? 2500} onChange={(event) => updateNumber("hospitalHealingCostPerHp", event.target.value)} /></label>
        <label>CSV таблицы населения<input type="url" value={populationSheetCsvUrl} onChange={(event) => setPopulationSheetCsvUrl(event.target.value)} placeholder="https://docs.google.com/..." /></label>
      </div>
      <button className="button" type="button" disabled={!populationSheetCsvUrl.trim() || populationSheetCsvUrl.trim() === (settings.populationSheetCsvUrl ?? "")} onClick={() => onAction({ type: "UPDATE_SETTINGS", settings: { populationSheetCsvUrl: populationSheetCsvUrl.trim() } })}>Сохранить адрес таблицы</button>
    </section>
  );
}
