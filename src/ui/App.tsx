import { useState } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { StrategicCityEditor } from "./components/StrategicCityEditor";
import { BattlesPage } from "./pages/BattlesPage";
import { ForcesPage } from "./pages/ForcesPage";
import { ManagementPage } from "./pages/ManagementPage";
import { MovementPage } from "./pages/MovementPage";
import { MapEditorPage } from "./pages/MapEditorPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SidesPage } from "./pages/SidesPage";
import { useExtensionState, type ExtensionServices, type UiCommand } from "./state/useExtensionState";

type PlayerTab = "ARMIES" | "TURN" | "BATTLES";
type GmTab = "OVERVIEW" | "ARMIES" | "MAP" | "CITIES" | "BATTLES" | "MANAGEMENT";
type Tab = PlayerTab | GmTab;
const LABELS: Record<Tab, string> = {
  OVERVIEW: "Обзор",
  ARMIES: "Войска",
  TURN: "Ход",
  MAP: "Карта",
  CITIES: "Города",
  BATTLES: "Бои",
  MANAGEMENT: "Управление"
};

export function App({ services }: { services: ExtensionServices }) {
  const state = useExtensionState(services);
  const [playerTab, setPlayerTab] = useState<PlayerTab>("ARMIES");
  const [gmTab, setGmTab] = useState<GmTab>("OVERVIEW");
  const [dangerous, setDangerous] = useState<UiCommand | undefined>();
  if (!state.ready) return <main className="state-screen">Загрузка…</main>;
  if (!state.sceneReady) return <main className="state-screen">Откройте сцену Owlbear Rodeo.</main>;
  if (state.futureSchema) return <main className="state-screen warning">Данные созданы более новой версией расширения. Доступен только просмотр.</main>;

  const isGM = state.role === "GM";
  const navalRequestCount = isGM ? (state.pendingNavalBattleRequests?.length ?? 0) : 0;
  const tabs: readonly Tab[] = isGM ? ["OVERVIEW", "ARMIES", "MAP", "CITIES", "BATTLES", "MANAGEMENT"] : ["ARMIES", "TURN", "BATTLES"];
  const tab: Tab = isGM ? gmTab : playerTab;
  const selectTab = (next: Tab) => isGM ? setGmTab(next as GmTab) : setPlayerTab(next as PlayerTab);

  const send = (command: UiCommand) => {
    if (["DELETE_SIDE", "DELETE_STATE", "DELETE_STRATEGIC_CITY", "STOP_ALL", "RELEASE_BATTLE_GROUP", "COMPLETE_TURN_NOW", "REQUEST_ARMY_DISBAND", "UNREGISTER_SHIP", "COMPLETE_NAVAL_BATTLE"].includes(command.type) || (command.type === "SET_ARMY_HP" && command.hp === 0)) setDangerous(command);
    else void state.send(command);
  };

  return (
    <main className="app-shell" data-theme="letopis-wiki-light">
      <header className="topbar wiki-topbar">
        <div className="brand-cluster">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}cover.png`} alt="Летопись: Военная панель" />
          <div className="brand-copy"><p className="brand-kicker">Летопись</p><h1>Военная панель</h1></div>
        </div>
        <span className="role-badge">{isGM ? "Ведущий" : "Игрок"}</span>
      </header>
      <nav className="tabs tabs-primary wiki-nav" aria-label="Разделы Летописи">
        {tabs.map((item) => <button type="button" key={item} aria-label={LABELS[item]} className={tab === item ? "active" : ""} onClick={() => selectTab(item)}>{LABELS[item]}{isGM && item === "BATTLES" && navalRequestCount > 0 && <span className="count-pill" aria-hidden="true">{navalRequestCount}</span>}</button>)}
      </nav>
      <div className="content wiki-content">
        {isGM && navalRequestCount > 0 && tab !== "BATTLES" && <aside className="registration-card naval-request-notice" role="status" aria-label="Заявки на морской бой"><div className="registration-copy"><strong>Заявки на морской бой: {navalRequestCount}</strong><small>Есть ожидающие решения ведущего заявки. Все они собраны в одном списке.</small></div><button className="button primary" type="button" onClick={() => setGmTab("BATTLES")}>Открыть заявки</button></aside>}
        {tab === "OVERVIEW" && isGM && <OverviewPage armies={state.armies} wars={state.wars} turn={state.turn} onAction={send} />}
        {tab === "ARMIES" && <><ForcesPage armies={state.armies} ships={state.ships} sides={state.sides} role={state.role} playerId={state.playerId} leaderSideIds={state.leaderSideIds} memberSideIds={state.memberSideIds} relations={state.relations} navalRequestTargets={state.navalRequestTargets} pendingNavalBattleRequests={state.pendingNavalBattleRequests} transportEmbarkTargets={state.transportEmbarkTargets} pendingTransportEmbarkRequests={state.pendingTransportEmbarkRequests} turnPhase={state.turn.phase} onAction={send} />{!isGM && state.leaderSideIds.size > 0 && <details className="leader-management"><summary>Управление фракцией</summary><SidesPage role="PLAYER" playerId={state.playerId} sides={state.sides.filter((side) => state.leaderSideIds.has(side.id))} players={state.players} leaderSideIds={state.leaderSideIds} onAction={send} /></details>}</>}
        {tab === "TURN" && !isGM && <MovementPage armies={state.armies} turn={state.turn} isGM={false} leaderSideIds={state.leaderSideIds} onAction={send} />}
        {tab === "MAP" && isGM && <MapEditorPage terrain={state.terrain} sides={state.sides} states={state.states} onAction={send} />}
        {tab === "CITIES" && isGM && <StrategicCityEditor role="GM" states={state.states} cities={state.strategicCities} onCreate={(city) => send({ type: "CREATE_STRATEGIC_CITY", city })} onUpdate={(cityId, patch) => send({ type: "UPDATE_STRATEGIC_CITY", cityId, patch })} onDelete={(cityId) => send({ type: "DELETE_STRATEGIC_CITY", cityId })} />}
        {tab === "BATTLES" && <BattlesPage battles={state.battleGroups} armies={state.armies} ships={state.ships} pendingNavalBattleRequests={state.pendingNavalBattleRequests} {...(state.navalBattleAreaDraft ? { navalBattleAreaDraft: state.navalBattleAreaDraft } : {})} {...(state.activeNavalBattle ? { activeNavalBattle: state.activeNavalBattle } : {})} isGM={isGM} onAction={send} />}
        {tab === "MANAGEMENT" && isGM && <ManagementPage playerId={state.playerId} sides={state.sides} states={state.states} players={state.players} relations={state.relations} stateRelations={state.stateRelations ?? {}} wars={state.wars} settings={state.settings} leaderSideIds={state.leaderSideIds} onAction={send} runDiagnostic={state.runDiagnostic} />}
      </div>
      <ConfirmDialog open={dangerous !== undefined} title="Подтвердите действие" message={dangerous?.type === "REQUEST_ARMY_DISBAND" ? "Армия будет распущена в начале следующего глобального хода. Отменить роспуск после подтверждения невозможно." : dangerous?.type === "UNREGISTER_SHIP" ? "Корабль будет снят с регистрации. Его токен останется на карте как обычный объект." : dangerous?.type === "COMPLETE_NAVAL_BATTLE" ? "Морской бой будет завершён вручную. Зарегистрированные корабли вернутся на стратегические позиции и курсы, сохранённые при начале боя. Продолжить?" : dangerous?.type === "DELETE_STRATEGIC_CITY" ? "Стратегический город будет удалён из системы. Клетки карты и государственные границы не изменятся." : dangerous?.type === "SET_ARMY_HP" && dangerous.hp === 0 ? "Установка 0 HP уничтожит армию и удалит её с карты. Продолжить?" : "Это действие изменит общее состояние сцены."} onCancel={() => setDangerous(undefined)} onConfirm={() => { if (dangerous) void state.send(dangerous); setDangerous(undefined); }} />
    </main>
  );
}
