import type { SceneSettings } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function SettingsPage({ settings, onAction }: { settings: SceneSettings; onAction(command: UiCommand): void }) {
  const updateNumber = (key: keyof SceneSettings, value: string) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) onAction({ type: "UPDATE_SETTINGS", settings: { [key]: numeric } });
  };
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Правила</p><h2>Настройки</h2></div></div>
      <div className="form-grid">
        <label>Лимит маршрута<input type="number" min="0" value={settings.defaultMaxRouteDistanceCells} onChange={(event) => updateNumber("defaultMaxRouteDistanceCells", event.target.value)} /></label>
        <label>Дальность обнаружения<input type="number" min="0" value={settings.defaultDetectionRangeCells} onChange={(event) => updateNumber("defaultDetectionRangeCells", event.target.value)} /></label>
        <label className="toggle"><input type="checkbox" checked={settings.allowPlayersToCreateRoutes} onChange={(event) => onAction({ type: "UPDATE_SETTINGS", settings: { allowPlayersToCreateRoutes: event.target.checked } })} />Маршруты игроков</label>
      </div>
    </section>
  );
}
