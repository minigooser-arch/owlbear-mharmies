import { useState } from "react";
import type { SceneSettings, Side, SideRelation, StateEntity, StateRelations, WarState } from "../../shared/types";
import type { DiagnosticTestId } from "../../owlbear/diagnostics";
import type { PartyPlayerView, UiCommand } from "../state/useExtensionState";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { RelationsPage } from "./RelationsPage";
import { SettingsPage } from "./SettingsPage";
import { SidesPage } from "./SidesPage";
import { StateDiplomacyPage } from "./StateDiplomacyPage";
import { StatesPage } from "./StatesPage";
import { WarsPage } from "./WarsPage";

type ManagementSection = "SIDES" | "STATES" | "STATE_DIPLOMACY" | "RELATIONS" | "WARS" | "SETTINGS" | "DIAGNOSTICS";
const LABELS: Record<ManagementSection, string> = {
  SIDES: "Фракции",
  STATES: "Государства",
  STATE_DIPLOMACY: "Межгосударственные отношения",
  RELATIONS: "Отношения фракций",
  WARS: "Войны",
  SETTINGS: "Настройки",
  DIAGNOSTICS: "Диагностика"
};

export function ManagementPage({
  playerId, sides, states, players, relations, stateRelations, wars, settings, leaderSideIds, onAction, runDiagnostic
}: {
  playerId: string;
  sides: readonly Side[];
  states: readonly StateEntity[];
  players: readonly PartyPlayerView[];
  relations: Readonly<Record<string, Record<string, SideRelation>>>;
  stateRelations: StateRelations;
  wars: readonly WarState[];
  settings: SceneSettings;
  leaderSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
  runDiagnostic(testId: DiagnosticTestId): Promise<unknown>;
}) {
  const [section, setSection] = useState<ManagementSection>("SIDES");
  return (
    <section aria-labelledby="management-title">
      <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Администрирование</p><h2 id="management-title">Управление</h2><p className="page-description">Фракции, государства, дипломатия, войны и технические настройки сцены.</p></div></div>
      <nav className="subtabs" aria-label="Разделы управления">
        {(Object.keys(LABELS) as ManagementSection[]).map((item) => <button key={item} type="button" className={section === item ? "active" : ""} onClick={() => setSection(item)}>{LABELS[item]}</button>)}
      </nav>
      <div className="management-content">
        {section === "SIDES" && <SidesPage role="GM" playerId={playerId} sides={sides} players={players} leaderSideIds={leaderSideIds} onAction={onAction} />}
        {section === "STATES" && <StatesPage states={states} sides={sides} onAction={onAction} />}
        {section === "STATE_DIPLOMACY" && <StateDiplomacyPage states={states} stateRelations={stateRelations} onAction={onAction} />}
        {section === "RELATIONS" && <RelationsPage sides={sides} relations={relations} onAction={onAction} />}
        {section === "WARS" && <WarsPage wars={wars} sides={sides} states={states} onAction={onAction} />}
        {section === "SETTINGS" && <SettingsPage settings={settings} onAction={onAction} />}
        {section === "DIAGNOSTICS" && <DiagnosticsPage run={runDiagnostic} />}
      </div>
    </section>
  );
}
