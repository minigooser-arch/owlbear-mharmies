import type { BattleGroup } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function BattlesPage({ battles, isGM, onAction }: { battles: readonly BattleGroup[]; isGM: boolean; onAction(command: UiCommand): void }) {
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Контакты</p><h2>Бои</h2></div></div>
      <div className="card-list">{battles.map((battle) => <article className="army-card" key={battle.battleId}><h3>{battle.battleId}</h3><p>Участников: {battle.participantIds.length}</p>{isGM && <button onClick={() => onAction({ type: "RELEASE_BATTLE_GROUP", battleId: battle.battleId })}>Развести армии</button>}</article>)}{battles.length === 0 && <p className="empty">Активных боёв нет.</p>}</div>
    </section>
  );
}
