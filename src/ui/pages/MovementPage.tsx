import type { ArmyView, UiCommand } from "../state/useExtensionState";

export function MovementPage({ armies, isGM, onAction }: { armies: readonly ArmyView[]; isGM: boolean; onAction(command: UiCommand): void }) {
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Команды</p><h2>Движение</h2></div></div>
      {isGM && <div className="command-grid"><button onClick={() => onAction({ type: "START_ALL" })}>Начать все</button><button onClick={() => onAction({ type: "PAUSE_ALL" })}>Пауза всех</button><button onClick={() => onAction({ type: "STOP_ALL" })}>Остановить все</button></div>}
      <p className="muted">Движутся: {armies.filter((army) => army.status === "MOVING").length}</p>
    </section>
  );
}
