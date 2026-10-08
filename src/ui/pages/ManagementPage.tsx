import type { ConscriptionLaw, LRTransaction, SceneSettings, Side, SideRelation, StateDemography, StateEntity, StateRelations, StrategicCity } from "../../shared/types";
import type { DiagnosticTestId } from "../../owlbear/diagnostics";
import type { ArmyView, PartyPlayerView, RebellionStatusView, UiCommand } from "../state/useExtensionState";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { RelationsPage } from "./RelationsPage";
import { RebellionsPage } from "./RebellionsPage";
import { SettingsPage } from "./SettingsPage";
import { SidesPage } from "./SidesPage";
import { StateDiplomacyPage } from "./StateDiplomacyPage";
import { StatesPage } from "./StatesPage";
import { LRLedgerPage } from "./LRLedgerPage";
import { PopulationPage } from "./PopulationPage";
import type { PopulationSyncSummary } from "../../population/populationSheetSync";

export type ManagementSection = "SIDES" | "STATES" | "STATE_DIPLOMACY" | "RELATIONS" | "REBELLIONS" | "POPULATION" | "LR" | "SETTINGS" | "DIAGNOSTICS";
const LABELS: Record<ManagementSection, string> = {
  SIDES: "Фракции",
  STATES: "Государства",
  STATE_DIPLOMACY: "Межгосударственные отношения",
  RELATIONS: "Отношения фракций",
  REBELLIONS: "Восстания",
  POPULATION: "Население и ЛР",
  LR: "Журнал ЛР",
  SETTINGS: "Настройки",
  DIAGNOSTICS: "Диагностика"
};

const GROUPS: readonly { id: string; label: string; sections: readonly ManagementSection[] }[] = [
  { id: "POLITICS", label: "Политика", sections: ["SIDES", "STATES", "STATE_DIPLOMACY", "RELATIONS", "REBELLIONS"] },
  { id: "RESOURCES", label: "Ресурсы", sections: ["POPULATION", "LR"] },
  { id: "SYSTEM", label: "Система", sections: ["SETTINGS", "DIAGNOSTICS"] }
];

export function ManagementPage({
  playerId, sides, states, armies, strategicCities, rebellionStatuses, lrTransactions, demographics, conscriptionLaws, players, relations, stateRelations, settings, leaderSideIds, section, onSectionChange, onAction, onSyncPopulation, runDiagnostic
}: {
  playerId: string;
  sides: readonly Side[];
  states: readonly StateEntity[];
  armies: readonly ArmyView[];
  strategicCities: readonly StrategicCity[];
  rebellionStatuses: readonly RebellionStatusView[];
  lrTransactions: readonly LRTransaction[];
  demographics: readonly StateDemography[];
  conscriptionLaws: readonly ConscriptionLaw[];
  players: readonly PartyPlayerView[];
  relations: Readonly<Record<string, Record<string, SideRelation>>>;
  stateRelations: StateRelations;
  settings: SceneSettings;
  leaderSideIds: ReadonlySet<string>;
  section: ManagementSection;
  onSectionChange(next: ManagementSection): void;
  onAction(command: UiCommand): void;
  onSyncPopulation(): Promise<PopulationSyncSummary>;
  runDiagnostic(testId: DiagnosticTestId): Promise<unknown>;
}) {
  const group: { id: string; label: string; sections: readonly ManagementSection[] } = GROUPS.find((entry) => entry.sections.includes(section)) ?? { id: "POLITICS", label: "Политика", sections: ["SIDES"] };
  return (
    <section aria-labelledby="management-title">
      <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Администрирование</p><h2 id="management-title">Управление</h2><p className="page-description">Фракции, государства, дипломатия, восстания и технические настройки сцены.</p></div></div>
      <nav className="management-groups" aria-label="Группы управления">
        {GROUPS.map((entry) => (
          <button key={entry.id} type="button" className={entry.id === group.id ? "active" : ""} onClick={() => onSectionChange(entry.sections[0] ?? "SIDES")}>
            {entry.label}
          </button>
        ))}
      </nav>
      <label className="management-picker">Раздел
        <select aria-label="Раздел управления" value={section} onChange={(event) => onSectionChange(event.target.value as ManagementSection)}>
          {group.sections.map((item) => <option key={item} value={item}>{LABELS[item]}</option>)}
        </select>
      </label>
      <div className="management-content">
        {section === "SIDES" && <SidesPage role="GM" playerId={playerId} sides={sides} armies={armies} players={players} leaderSideIds={leaderSideIds} onAction={onAction} />}
        {section === "STATES" && <StatesPage states={states} sides={sides} armies={armies} onAction={onAction} />}
        {section === "STATE_DIPLOMACY" && <StateDiplomacyPage states={states} stateRelations={stateRelations} onAction={onAction} />}
        {section === "RELATIONS" && <RelationsPage sides={sides} relations={relations} onAction={onAction} />}
        {section === "REBELLIONS" && <RebellionsPage states={states} sides={sides} cities={strategicCities} statuses={rebellionStatuses} onAction={onAction} />}
        {section === "POPULATION" && <PopulationPage states={states} demographics={demographics} conscriptionLaws={conscriptionLaws} settings={settings} onAction={onAction} onSyncPopulation={onSyncPopulation} />}
        {section === "LR" && <LRLedgerPage transactions={lrTransactions} onAction={onAction} />}
        {section === "SETTINGS" && <SettingsPage settings={settings} onAction={onAction} />}
        {section === "DIAGNOSTICS" && <DiagnosticsPage run={runDiagnostic} />}
      </div>
    </section>
  );
}
