import { useEffect, useState } from "react";
import type { BattleGroup } from "../../shared/types";
import type { ArmyView, UiCommand } from "../state/useExtensionState";

interface BattleCardProps {
  battle: BattleGroup;
  armies: readonly ArmyView[];
  isGM: boolean;
  onAction(command: UiCommand): void;
}

function BattleCard({ battle, armies, isGM, onAction }: BattleCardProps) {
  const [draft, setDraft] = useState(battle.name);

  useEffect(() => {
    setDraft(battle.name);
  }, [battle.name]);

  const trimmed = draft.trim();
  const nameLength = [...trimmed].length;
  const canSave = nameLength >= 1 && nameLength <= 80 && trimmed !== battle.name;
  const armyById = new Map(armies.map((army) => [army.id, army]));
  const participantArmies = battle.participantIds.map((armyId) => armyById.get(armyId)).filter((army): army is ArmyView => army !== undefined);

  return (
    <article className="army-card">
      {isGM ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) {
              onAction({ type: "RENAME_BATTLE_GROUP", battleId: battle.battleId, name: trimmed });
            }
          }}
        >
          <label>
            <span>Название боя</span>
            <input
              aria-label="Название боя"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!canSave}>Сохранить название</button>
        </form>
      ) : (
        <h3>{battle.name}</h3>
      )}
      <p>Участников: {battle.participantIds.length}</p>
      <div className="battle-participants" aria-label="Армии в бою">
        {participantArmies.map((army) => (
          <div className="battle-participant-row" key={army.id}>
            <div><strong>{army.name}</strong><span>{army.sideName}</span></div><strong>♥ {army.healthHp} / {army.healthMaxHp}</strong>
          </div>
        ))}
      </div>
      {isGM && (
        <div className="battle-management">
          <button
            type="button"
            onClick={() => onAction({ type: "RELEASE_BATTLE_GROUP", battleId: battle.battleId })}
          >
            Развести армии
          </button>

        </div>
      )}
    </article>
  );
}

export function BattlesPage({
  battles,
  armies = [],
  isGM,
  onAction
}: {
  battles: readonly BattleGroup[];
  armies?: readonly ArmyView[];
  isGM: boolean;
  onAction(command: UiCommand): void;
}) {
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Контакты</p><h2>Бои</h2></div></div>
      <div className="card-list">{battles.map((battle) => <BattleCard battle={battle} armies={armies} isGM={isGM} onAction={onAction} key={battle.battleId} />)}{battles.length === 0 && <p className="empty">Активных боёв нет.</p>}</div>
    </section>
  );
}
