import { useState, type FormEvent } from "react";
import type { Side } from "../../shared/types";
import { MILITARY_INFLUENCE_DELTAS, type MilitaryInfluenceReasonCode } from "../../sheets/militaryInfluence";
import type { ArmyView, PartyPlayerView, UiCommand } from "../state/useExtensionState";

interface SidesPageProps {
  role: "GM" | "PLAYER";
  playerId: string;
  sides: readonly Side[];
  armies?: readonly ArmyView[];
  players: readonly PartyPlayerView[];
  leaderSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
  createId?: () => string;
}

function playerLabel(player: PartyPlayerView | undefined, playerId: string): string {
  return player ? `${player.name} (${player.id})` : playerId;
}

const MILITARY_INFLUENCE_LABELS: Record<MilitaryInfluenceReasonCode, string> = {
  LAND_BATTLE_VICTORY: "Победа в сухопутном бою (+4)",
  NAVAL_BATTLE_VICTORY: "Победа в морском бою (+4)",
  DESTROY_ENEMY_ARMY: "Уничтожение вражеской армии (+3)",
  DESTROY_ENEMY_SHIP: "Уничтожение вражеского корабля (+3)",
  SUCCESSFUL_CITY_DEFENSE: "Успешная оборона своего города (+3)",
  SUCCESSFUL_CITY_OCCUPATION: "Успешная оккупация вражеского города (+3)",
  SHIP_TRANSFER: "Передача корабля другой фракции (-15)",
  MILITARY_UPGRADE_I: "Военная прокачка I уровня (-20)",
  APPOINT_COMMANDER_IN_CHIEF: "Назначение главнокомандующего (-30)",
  MILITARY_UPGRADE_II: "Военная прокачка II уровня (-30)",
  MILITARY_UPGRADE_III: "Военная прокачка III уровня (-50)"
};

export function SidesPage({
  role,
  playerId,
  sides,
  armies = [],
  players,
  leaderSideIds,
  onAction,
  createId = () => crypto.randomUUID()
}: SidesPageProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#b3261e");
  const [influenceReasons, setInfluenceReasons] = useState<Record<string, string>>({});
  const [influenceCodes, setInfluenceCodes] = useState<Record<string, MilitaryInfluenceReasonCode>>({});

  const createSide = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAction({
      type: "CREATE_SIDE",
      side: {
        id: createId(),
        name: trimmedName,
        color,
        playerIds: [],
        leaderPlayerIds: [],
        stateId: null
      }
    });
    setName("");
  };

  return (
    <section>
      <div className="section-heading">
        <div><p className="eyebrow">Управление</p><h2>Стороны</h2></div>
      </div>

      {role === "GM" && (
        <form className="side-create-form" onSubmit={createSide}>
          <label>
            Название стороны
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, Красные"
            />
          </label>
          <label className="color-field">
            Цвет
            <input
              aria-label="Цвет стороны"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
          <button className="button primary" type="submit" disabled={!name.trim()}>
            Добавить сторону
          </button>
        </form>
      )}

      <div className="card-list side-list">
        {sides.map((side) => {
          const canManageMembers = role === "GM" || leaderSideIds.has(side.id);
          const sideArmies = armies.filter((army) => army.sideId === side.id);
          const currentArmyHp = sideArmies.reduce((total, army) => total + army.healthHp, 0);
          const maxArmyHp = sideArmies.reduce((total, army) => total + army.healthMaxHp, 0);
          const ids = [...new Set([
            ...players.map((player) => player.id),
            ...side.playerIds,
            ...side.leaderPlayerIds
          ])];
          const playerById = new Map(players.map((player) => [player.id, player]));
          return (
            <article
              aria-label={`Сторона ${side.name}`}
              className="side-card"
              key={side.id}
            >
              <header className="side-card-heading">
                <span className="color-dot" style={{ background: side.color }} />
                <div>
                  <h3>{side.name}</h3>
                  <p>
                    Участников: {side.playerIds.length} · лидеров: {side.leaderPlayerIds.length}
                    {side.leaderPlayerIds.includes(playerId) ? " · вы лидер" : ""}
                  </p>
                </div>
                {role === "GM" && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Удалить ${side.name}`}
                    onClick={() => onAction({
                      type: "DELETE_SIDE",
                      sideId: side.id,
                      strategy: "UNREGISTER_ARMIES"
                    })}
                  >
                    ×
                  </button>
                )}
              </header>

              {canManageMembers && (
                <div className="side-player-list">
                  {ids.map((id) => {
                    const player = playerById.get(id);
                    const isMember = side.playerIds.includes(id);
                    const isLeader = side.leaderPlayerIds.includes(id);
                    const label = playerLabel(player, id);
                    return (
                      <div className={`side-player-row${player ? "" : " unavailable"}`} key={id}>
                        <div className="player-identity">
                          <span
                            className="player-color"
                            style={{ background: player?.color ?? "#5f6b7a" }}
                          />
                          <span>{player ? player.name : `Недоступен: ${id}`}</span>
                        </div>
                        <label>
                          <input
                            aria-label={`Участник ${label}`}
                            type="checkbox"
                            checked={isMember}
                            disabled={isLeader}
                            onChange={() => onAction({
                              type: isMember ? "REMOVE_SIDE_PLAYER" : "ADD_SIDE_PLAYER",
                              sideId: side.id,
                              playerId: id
                            })}
                          />
                          Участник
                        </label>
                        {role === "GM" && (
                          <label>
                            <input
                              aria-label={`Лидер ${label}`}
                              type="checkbox"
                              checked={isLeader}
                              onChange={() => onAction({
                                type: isLeader ? "REMOVE_SIDE_LEADER" : "ADD_SIDE_LEADER",
                                sideId: side.id,
                                playerId: id
                              })}
                            />
                            Лидер
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {role === "GM" && (
                <div className="card-actions">
                  <button
                    type="button"
                    className="button subtle"
                    aria-label={`${side.armyTokenAsset ? "Изменить" : "Задать"} токен армии для ${side.name}`}
                    onClick={() => onAction({ type: "SET_SIDE_ARMY_TOKEN", sideId: side.id })}
                  >
                    {side.armyTokenAsset ? "Изменить токен армии" : "Задать токен армии"}
                  </button>
                  {side.armyTokenAsset && <small>Ассет: {side.armyTokenAsset.name}</small>}
                </div>
              )}
              <div className="registration-card military-influence-card">
                <div className="registration-copy">
                  <strong>Военное влияние: {side.militaryInfluence ?? 0} 🪖</strong>
                  <small>{side.stateId ? "Баланс фракции. Операции записываются в ЛР_ОПЕРАЦИИ." : "Сначала назначьте фракции государство."}</small>
                  <small>Жизни армий: {currentArmyHp} / {maxArmyHp} HP</small>
                </div>
                {role === "GM" && side.stateId && (
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const reason = influenceReasons[side.id]?.trim();
                    if (!reason) return;
                    onAction({
                      type: "ADJUST_MILITARY_INFLUENCE",
                      factionId: side.id,
                      reasonCode: influenceCodes[side.id] ?? "LAND_BATTLE_VICTORY",
                      reason
                    });
                    setInfluenceReasons((current) => ({ ...current, [side.id]: "" }));
                  }}>
                    <label>
                      Результат военного влияния
                      <select
                        aria-label={`Результат военного влияния для ${side.name}`}
                        value={influenceCodes[side.id] ?? "LAND_BATTLE_VICTORY"}
                        onChange={(event) => setInfluenceCodes((current) => ({ ...current, [side.id]: event.target.value as MilitaryInfluenceReasonCode }))}
                      >
                        {(Object.keys(MILITARY_INFLUENCE_DELTAS) as MilitaryInfluenceReasonCode[]).map((code) => (
                          <option key={code} value={code}>{MILITARY_INFLUENCE_LABELS[code]}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Причина операции военного влияния
                      <input
                        aria-label={`Причина операции военного влияния для ${side.name}`}
                        value={influenceReasons[side.id] ?? ""}
                        onChange={(event) => setInfluenceReasons((current) => ({ ...current, [side.id]: event.target.value }))}
                        placeholder="Например, победа зафиксирована мастером"
                        required
                      />
                    </label>
                    <button className="button subtle" type="submit" disabled={!influenceReasons[side.id]?.trim()}>
                      Провести операцию военного влияния для {side.name}
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
        {sides.length === 0 && <p className="empty">Стороны ещё не созданы.</p>}
      </div>
    </section>
  );
}
