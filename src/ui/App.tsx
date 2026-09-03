import { useState } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { BattlesPage } from "./pages/BattlesPage";
import { ForcesPage } from "./pages/ForcesPage";
import { ManagementPage } from "./pages/ManagementPage";
import { MovementPage } from "./pages/MovementPage";
import { MapEditorPage } from "./pages/MapEditorPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SidesPage } from "./pages/SidesPage";
import { useExtensionState, type ExtensionServices, type UiCommand } from "./state/useExtensionState";

type PlayerTab = "ARMIES" | "TURN" | "BATTLES";
type GmTab = "OVERVIEW" | "ARMIES" | "MAP" | "BATTLES" | "MANAGEMENT";
type Tab = PlayerTab | GmTab;
const LABELS: Record<Tab, string> = {
  OVERVIEW: "Обзор",
  ARMIES: "Войска",
  TURN: "Ход",
  MAP: "Карта",
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
  const tabs: readonly Tab[] = isGM
    ? ["OVERVIEW", "ARMIES", "MAP", "BATTLES", "MANAGEMENT"]
    : ["ARMIES", "TURN", "BATTLES"];
  const tab: Tab = isGM ? gmTab : playerTab;
  const selectTab = (next: Tab) => isGM ? setGmTab(next as GmTab) : setPlayerTab(next as PlayerTab);

  const send = (command: UiCommand) => {
    if (["DELETE_SIDE", "STOP_ALL", "RELEASE_BATTLE_GROUP", "COMPLETE_TURN_NOW", "REQUEST_ARMY_DISBAND", "UNREGISTER_SHIP"].includes(command.type) || (command.type === "SET_ARMY_HP" && command.hp === 0)) setDangerous(command);
    else void state.send(command);
  };

  return (
    <main className="app-shell" data-theme="letopis-wiki-light">
      <header className="topbar wiki-topbar">
        <div className="brand-cluster">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}icon-1.2.png`} alt="Летопись: Военная панель" />
          <div className="brand-copy">
            <p className="brand-kicker">Летопись</p>
            <h1>Военная панель</h1>
          </div>
        </div>
        <span className="role-badge">{isGM ? "Ведущий" : "Игрок"}</span>
      </header>
      <nav className="tabs tabs-primary wiki-nav" aria-label="Разделы Летописи">
        {tabs.map((item) => (
          <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => selectTab(item)}>
            {LABELS[item]}
          </button>
        ))}
      </nav>
      <div className="content wiki-content">
        {tab === "OVERVIEW" && isGM && <OverviewPage armies={state.armies} wars={state.wars} turn={state.turn} onAction={send} />}
        {tab === "ARMIES" && <>
          <ForcesPage armies={state.armies} ships={state.ships} sides={state.sides} role={state.role} playerId={state.playerId} leaderSideIds={state.leaderSideIds} memberSideIds={state.memberSideIds} onAction={send} />
          {!isGM && state.leaderSideIds.size > 0 && <details className="leader-management"><summary>Управление фракцией</summary><SidesPage role="PLAYER" playerId={state.playerId} sides={state.sides.filter((side) => state.leaderSideIds.has(side.id))} players={state.players} leaderSideIds={state.leaderSideIds} onAction={send} /></details>}
        </>}
        {tab === "TURN" && !isGM && <MovementPage armies={state.armies} turn={state.turn} isGM={false} leaderSideIds={state.leaderSideIds} onAction={send} />}
        {tab === "MAP" && isGM && <MapEditorPage terrain={state.terrain} sides={state.sides} states={state.states} onAction={send} />}
        {tab === "BATTLES" && <BattlesPage battles={state.battleGroups} armies={state.armies} isGM={isGM} onAction={send} />}
        {tab === "MANAGEMENT" && isGM && <ManagementPage playerId={state.playerId} sides={state.sides} states={state.states} players={state.players} relations={state.relations} wars={state.wars} settings={state.settings} leaderSideIds={state.leaderSideIds} onAction={send} runDiagnostic={state.runDiagnostic} />}
      </div>
      <ConfirmDialog open={dangerous !== undefined} title="Подтвердите действие" message={dangerous?.type === "REQUEST_ARMY_DISBAND" ? "Армия будет распущена в начале следующего глобального хода. Отменить роспуск после подтверждения невозможно." : dangerous?.type === "UNREGISTER_SHIP" ? "Корабль будет снят с регистрации. Его токен останется на карте как обычный объект." : dangerous?.type === "SET_ARMY_HP" && dangerous.hp === 0 ? "Установка 0 HP уничтожит армию и удалит её с карты. Продолжить?" : "Это действие изменит общее состояние сцены."} onCancel={() => setDangerous(undefined)} onConfirm={() => { if (dangerous) void state.send(dangerous); setDangerous(undefined); }} />
    </main>
  );
}
