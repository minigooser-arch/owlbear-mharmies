import { useState } from "react";
import type { SceneSettings, Side, SideRelation, StateEntity, WarState } from "../../shared/types";
import type { DiagnosticTestId } from "../../owlbear/diagnostics";
import type { PartyPlayerView, UiCommand } from "../state/useExtensionState";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { RelationsPage } from "./RelationsPage";
import { SettingsPage } from "./SettingsPage";
import { SidesPage } from "./SidesPage";
import { WarsPage } from "./WarsPage";

type ManagementSection = "SIDES" | "RELATIONS" | "WARS" | "SETTINGS" | "DIAGNOSTICS";
const LABELS: Record<ManagementSection, string> = {
  SIDES: "Фракции",
  RELATIONS: "Отношения",
  WARS: "Войны",
  SETTINGS: "Настройки",
  DIAGNOSTICS: "Диагностика"
};

export function ManagementPage({
  playerId, sides, states, players, relations, wars, settings, leaderSideIds, onAction, runDiagnostic
}: {
  playerId: string;
  sides: readonly Side[];
  states: readonly StateEntity[];
  players: readonly PartyPlayerView[];
  relations: Readonly<Record<string, Record<string, SideRelation>>>;
  wars: readonly WarState[];
  settings: SceneSettings;
  leaderSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
  runDiagnostic(testId: DiagnosticTestId): Promise<unknown>;
}) {
  const [section, setSection] = useState<ManagementSection>("SIDES");
  return (
    <section aria-labelledby="management-title">
      <div className="section-heading"><div><p className="eyebrow">Администрирование</p><h2 id="management-title">Управление</h2></div></div>
      <nav className="subtabs" aria-label="Разделы управления">
        {(Object.keys(LABELS) as ManagementSection[]).map((item) => <button key={item} type="button" className={section === item ? "active" : ""} onClick={() => setSection(item)}>{LABELS[item]}</button>)}
      </nav>
      <div className="management-content">
        {section === "SIDES" && <SidesPage role="GM" playerId={playerId} sides={sides} players={players} leaderSideIds={leaderSideIds} onAction={onAction} />}
        {section === "RELATIONS" && <RelationsPage sides={sides} relations={relations} onAction={onAction} />}
        {section === "WARS" && <WarsPage wars={wars} sides={sides} states={states} onAction={onAction} />}
        {section === "SETTINGS" && <SettingsPage settings={settings} onAction={onAction} />}
        {section === "DIAGNOSTICS" && <DiagnosticsPage run={runDiagnostic} />}
      </div>
    </section>
  );
}
