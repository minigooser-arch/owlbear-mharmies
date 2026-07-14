import { useState } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ArmiesPage } from "./pages/ArmiesPage";
import { BattlesPage } from "./pages/BattlesPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { MovementPage } from "./pages/MovementPage";
import { RelationsPage } from "./pages/RelationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SidesPage } from "./pages/SidesPage";
import { useExtensionState, type ExtensionServices, type UiCommand } from "./state/useExtensionState";

type Tab = "ARMIES" | "SIDES" | "RELATIONS" | "MOVEMENT" | "BATTLES" | "SETTINGS" | "DIAGNOSTICS";
const LABELS: Record<Tab, string> = { ARMIES: "Армии", SIDES: "Стороны", RELATIONS: "Отношения", MOVEMENT: "Движение", BATTLES: "Бои", SETTINGS: "Настройки", DIAGNOSTICS: "Диагностика" };

export function App({ services }: { services: ExtensionServices }) {
  const state = useExtensionState(services);
  const [tab, setTab] = useState<Tab>("ARMIES");
  const [dangerous, setDangerous] = useState<UiCommand | undefined>();
  if (!state.ready) return <main className="state-screen">Загрузка…</main>;
  if (!state.sceneReady) return <main className="state-screen">Откройте сцену Owlbear Rodeo.</main>;
  if (state.futureSchema) return <main className="state-screen warning">Данные созданы более новой версией расширения. Доступен только просмотр.</main>;

  const tabs: Tab[] = state.role === "GM"
    ? ["ARMIES", "SIDES", "RELATIONS", "MOVEMENT", "BATTLES", "SETTINGS", "DIAGNOSTICS"]
    : ["ARMIES", "MOVEMENT", "BATTLES", "DIAGNOSTICS"];
  const send = (command: UiCommand) => {
    if (["DELETE_SIDE", "STOP_ALL", "RELEASE_BATTLE_GROUP"].includes(command.type)) setDangerous(command);
    else void state.send(command);
  };
  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark">Л</div><div><p>Летопись</p><h1>Армии</h1></div><span className="role-badge">{state.role === "GM" ? "Ведущий" : "Игрок"}</span></header>
      <nav className="tabs" aria-label="Разделы">{tabs.map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{LABELS[item]}</button>)}</nav>
      <div className="content">
        {tab === "ARMIES" && <ArmiesPage armies={state.armies} role={state.role} playerId={state.playerId} onAction={send} />}
        {tab === "SIDES" && <SidesPage sides={state.sides} onAction={send} />}
        {tab === "RELATIONS" && <RelationsPage sides={state.sides} relations={state.relations} onAction={send} />}
        {tab === "MOVEMENT" && <MovementPage armies={state.armies} isGM={state.role === "GM"} onAction={send} />}
        {tab === "BATTLES" && <BattlesPage battles={state.battleGroups} isGM={state.role === "GM"} onAction={send} />}
        {tab === "SETTINGS" && <SettingsPage settings={state.settings} onAction={send} />}
        {tab === "DIAGNOSTICS" && <DiagnosticsPage run={state.runDiagnostic} />}
      </div>
      <footer className="summary"><span>Всего {state.counters.total}</span><span>В пути {state.counters.moving}</span><span>В бою {state.counters.inBattle}</span></footer>
      <ConfirmDialog open={dangerous !== undefined} title="Подтвердите действие" message="Это действие изменит общее состояние сцены." onCancel={() => setDangerous(undefined)} onConfirm={() => { if (dangerous) void state.send(dangerous); setDangerous(undefined); }} />
    </main>
  );
}
