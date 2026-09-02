import { useState, type FormEvent } from "react";
import type { Side } from "../../shared/types";
import type { PartyPlayerView, UiCommand } from "../state/useExtensionState";

interface SidesPageProps {
  role: "GM" | "PLAYER";
  playerId: string;
  sides: readonly Side[];
  players: readonly PartyPlayerView[];
  leaderSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
  createId?: () => string;
}

function playerLabel(player: PartyPlayerView | undefined, playerId: string): string {
  return player ? `${player.name} (${player.id})` : playerId;
}

export function SidesPage({
  role,
  playerId,
  sides,
  players,
  leaderSideIds,
  onAction,
  createId = () => crypto.randomUUID()
}: SidesPageProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#b3261e");

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
            </article>
          );
        })}
        {sides.length === 0 && <p className="empty">Стороны ещё не созданы.</p>}
      </div>
    </section>
  );
}
