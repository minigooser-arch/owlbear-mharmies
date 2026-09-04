import { useEffect, useState } from "react";
import type { BattleGroup } from "../../shared/types";
import type { ArmyView, NavalBattleView, ShipView, UiCommand } from "../state/useExtensionState";

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
    <article className="army-card wiki-card battle-card">
      {isGM ? (
        <form className="battle-name-form"
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
          <button className="button ghost" type="submit" disabled={!canSave}>Сохранить название</button>
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
            className="button danger subtle"
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

function NavalBattleCard({
  battle,
  ships,
  onAction
}: {
  battle: NavalBattleView;
  ships: readonly ShipView[];
  onAction(command: UiCommand): void;
}) {
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  useEffect(() => setConfirmingCompletion(false), [battle.id]);

  const currentShip = battle.currentShipId
    ? ships.find((ship) => ship.id === battle.currentShipId)
    : ships.find((ship) => ship.isCurrentNavalTurn);
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const completedShipIds = new Set(battle.completedShipIdsThisRound ?? []);
  const exitedShipIds = new Set(battle.exitedShipIds ?? []);
  const initiative = battle.initiative ?? [];

  return (
    <article className="army-card wiki-card battle-card naval-battle-card">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Флот</p>
          <h3>Морской бой</h3>
        </div>
      </div>
      <div className="battle-participants" aria-label="Состояние морского боя">
        <p>Раунд: {battle.roundNumber}</p>
        <p>Кораблей: {battle.participantCount}</p>
        <p>Ход: {currentShip?.name ?? "—"}</p>
      </div>
      {initiative.length > 0 && (
        <ol className="battle-participants naval-initiative-list" aria-label="Порядок инициативы">
          {initiative.map((entry, index) => {
            const ship = shipById.get(entry.shipId);
            const exited = exitedShipIds.has(entry.shipId) || ship?.navalExited === true;
            const completed = completedShipIds.has(entry.shipId);
            const current = battle.currentShipId === entry.shipId;
            const status = exited
              ? "Вышел"
              : current
                ? "Ход"
                : completed
                  ? "Ход завершён"
                  : ship && ship.hp <= 0
                    ? "Уничтожен"
                    : "Ожидает";
            const canMakeActive = Boolean(
              ship &&
              !current &&
              !completed &&
              !exited &&
              ship.hp > 0 &&
              ship.status === "IN_NAVAL_BATTLE"
            );
            return (
              <li className="battle-participant-row" key={entry.shipId}>
                <div><strong>{index + 1}. {ship?.name ?? entry.shipId}</strong><span>{status}</span></div>
                <div className="naval-initiative-actions">
                  <strong>{entry.total}</strong>
                  {canMakeActive && ship && (
                    <button
                      className="button ghost subtle"
                      type="button"
                      aria-label={`Сделать активным: ${ship.name}`}
                      onClick={() => onAction({ type: "SET_ACTIVE_NAVAL_SHIP", shipId: ship.id })}
                    >
                      Сделать активным
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="muted">Завершение вручную вернёт зарегистрированные корабли на стратегические позиции и курсы, сохранённые при начале боя.</p>
      <div className="battle-management">
        {confirmingCompletion ? (
          <div className="naval-completion-confirmation" role="alert">
            <p><strong>Завершить морской бой?</strong> Корабли вернутся на сохранённые стратегические позиции и курсы.</p>
            <div className="card-actions">
              <button
                className="button ghost"
                type="button"
                aria-label="Отмена завершения боя"
                onClick={() => setConfirmingCompletion(false)}
              >
                Отмена
              </button>
              <button
                className="button danger subtle"
                type="button"
                aria-label="Подтвердить завершение морского боя"
                onClick={() => {
                  setConfirmingCompletion(false);
                  onAction({ type: "COMPLETE_NAVAL_BATTLE" });
                }}
              >
                Подтвердить завершение
              </button>
            </div>
          </div>
        ) : (
          <button
            className="button danger subtle"
            type="button"
            onClick={() => setConfirmingCompletion(true)}
          >
            Завершить морской бой
          </button>
        )}
      </div>
    </article>
  );
}

export function BattlesPage({
  battles,
  armies = [],
  ships = [],
  activeNavalBattle,
  isGM,
  onAction
}: {
  battles: readonly BattleGroup[];
  armies?: readonly ArmyView[];
  ships?: readonly ShipView[];
  activeNavalBattle?: NavalBattleView;
  isGM: boolean;
  onAction(command: UiCommand): void;
}) {
  const tacticalShips = ships.filter((ship) => ship.status === "IN_NAVAL_BATTLE");
  const inferredCurrentShip = tacticalShips.find((ship) => ship.isCurrentNavalTurn);
  const inferredRound = tacticalShips.find((ship) => ship.navalRoundNumber !== undefined)?.navalRoundNumber;
  const navalBattle = isGM
    ? activeNavalBattle ?? (tacticalShips.length > 0
      ? {
          id: "active-naval-battle",
          roundNumber: inferredRound ?? 1,
          participantCount: tacticalShips.length,
          currentShipId: inferredCurrentShip?.id ?? null
        }
      : undefined)
    : undefined;
  const hasVisibleBattle = battles.length > 0 || navalBattle !== undefined;

  return (
    <section aria-labelledby="battles-title">
      <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Контакты</p><h2 id="battles-title">Бои</h2><p className="page-description">Активные столкновения, участвующие армии и быстрые действия ведущего.</p></div></div>
      <div className="card-list">
        {navalBattle && <NavalBattleCard battle={navalBattle} ships={ships} onAction={onAction} />}
        {battles.map((battle) => <BattleCard battle={battle} armies={armies} isGM={isGM} onAction={onAction} key={battle.battleId} />)}
        {!hasVisibleBattle && <p className="empty empty-panel">Активных боёв нет.</p>}
      </div>
    </section>
  );
}
