import { useEffect, useState } from "react";
import type { SceneSettings } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";
import { readSheetWritebackToken, saveSheetWritebackToken } from "../../sheets/writebackClient";

export function SettingsPage({ settings, onAction }: { settings: SceneSettings; onAction(command: UiCommand): void }) {
  const [populationSheetCsvUrl, setPopulationSheetCsvUrl] = useState(settings.populationSheetCsvUrl ?? "");
  const [conscriptionSheetCsvUrl, setConscriptionSheetCsvUrl] = useState(settings.conscriptionSheetCsvUrl ?? "");
  const [sheetWritebackUrl, setSheetWritebackUrl] = useState(settings.sheetWritebackUrl ?? "");
  const [sheetWritebackToken, setSheetWritebackToken] = useState("");
  useEffect(() => setPopulationSheetCsvUrl(settings.populationSheetCsvUrl ?? ""), [settings.populationSheetCsvUrl]);
  useEffect(() => setConscriptionSheetCsvUrl(settings.conscriptionSheetCsvUrl ?? ""), [settings.conscriptionSheetCsvUrl]);
  useEffect(() => setSheetWritebackUrl(settings.sheetWritebackUrl ?? ""), [settings.sheetWritebackUrl]);
  useEffect(() => setSheetWritebackToken(readSheetWritebackToken()), []);
  const updateNumber = (key: keyof SceneSettings, value: string) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) onAction({ type: "UPDATE_SETTINGS", settings: { [key]: numeric } });
  };
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Правила</p><h2>Настройки</h2></div></div>
      <div className="form-grid">
        <label>Дальность обнаружения<input type="number" min="0" value={settings.defaultDetectionRangeCells} onChange={(event) => updateNumber("defaultDetectionRangeCells", event.target.value)} /></label>
        <label>Комплектация армии, ЛР за HP<input type="number" min="0" value={settings.armyFormationCostPerHp ?? 10000} onChange={(event) => updateNumber("armyFormationCostPerHp", event.target.value)} /></label>
        <label>Обычное лечение, ЛР за HP<input type="number" min="0" value={settings.armyHealingCostPerHp ?? 5000} onChange={(event) => updateNumber("armyHealingCostPerHp", event.target.value)} /></label>
        <label>Лечение в госпитале, ЛР за HP<input type="number" min="0" value={settings.hospitalHealingCostPerHp ?? 2500} onChange={(event) => updateNumber("hospitalHealingCostPerHp", event.target.value)} /></label>
        <label>CSV таблицы населения<input type="url" value={populationSheetCsvUrl} onChange={(event) => setPopulationSheetCsvUrl(event.target.value)} placeholder="https://docs.google.com/..." /></label>
        <label>CSV таблицы государств и призыва<input type="url" value={conscriptionSheetCsvUrl} onChange={(event) => setConscriptionSheetCsvUrl(event.target.value)} placeholder="https://docs.google.com/..." /></label>
        <label>Apps Script writeback URL<input type="url" value={sheetWritebackUrl} onChange={(event) => setSheetWritebackUrl(event.target.value)} placeholder="https://script.google.com/macros/s/..." /></label>
        <label>Writeback-токен GM<input type="password" value={sheetWritebackToken} onChange={(event) => setSheetWritebackToken(event.target.value)} placeholder="Хранится только локально у GM" autoComplete="off" /></label>
        <small>В таблицу отправляются агрегаты HP по государствам и фракциям и операции военного влияния. HP отдельных армий и корабли остаются внутри Owlbear. Токен не записывается в SceneSettings и не передаётся игрокам.</small>
      </div>
      <div className="button-row">
        <button className="button" type="button" disabled={!populationSheetCsvUrl.trim() || populationSheetCsvUrl.trim() === (settings.populationSheetCsvUrl ?? "")} onClick={() => onAction({ type: "UPDATE_SETTINGS", settings: { populationSheetCsvUrl: populationSheetCsvUrl.trim() } })}>Сохранить CSV населения</button>
        <button className="button" type="button" disabled={!conscriptionSheetCsvUrl.trim() || conscriptionSheetCsvUrl.trim() === (settings.conscriptionSheetCsvUrl ?? "")} onClick={() => onAction({ type: "UPDATE_SETTINGS", settings: { conscriptionSheetCsvUrl: conscriptionSheetCsvUrl.trim() } })}>Сохранить CSV призыва</button>
        <button className="button" type="button" disabled={sheetWritebackUrl.trim() === (settings.sheetWritebackUrl ?? "") && sheetWritebackToken === readSheetWritebackToken()} onClick={() => {
          saveSheetWritebackToken(sheetWritebackToken);
          onAction({ type: "UPDATE_SETTINGS", settings: { sheetWritebackUrl: sheetWritebackUrl.trim() } });
        }}>Сохранить writeback</button>
      </div>
    </section>
  );
}

