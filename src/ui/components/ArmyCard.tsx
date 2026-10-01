import { useEffect, useState } from "react";
import type { ArmyView, UiCommand } from "../state/useExtensionState";
import type { ArmyUpgradeBranch, UpgradeLevel, UpgradeVariant } from "../../shared/types";
import { formatMovementUnits, movementDenialMessage } from "../presentation/movement";

const STATUS: Record<ArmyView["status"], string> = {
  READY: "Готова",
  MOVING: "Движется",
  PAUSED: "На паузе",
  IN_BATTLE: "В бою"
};


const ARMY_UPGRADES: Record<ArmyUpgradeBranch, {
  title: string;
  levels: Record<UpgradeLevel, Record<UpgradeVariant, string>>;
}> = {
  recovery: {
    title: "🩺 Восстановление",
    levels: {
      1: { A: "Усиленный состав — +5 максимальных HP", B: "Полевые санитары — +2 HP к восстановлению" },
      2: { A: "Полевое снабжение — +5 HP вне города и дороги", B: "Развитый тыл — +5 HP в городе, на дороге и с госпиталем" },
      3: { A: "Гвардейский состав — +10 максимальных HP", B: "Военная медицина — восстановление +50%" }
    }
  },
  motorization: {
    title: "🚂 Моторизация",
    levels: {
      1: { A: "Маршевая подготовка — +1 ОП", B: "Вездеходность — горы, холмы и болота −0,5 ОП" },
      2: { A: "Моторизованные части — ещё +1 ОП", B: "Пересечённая местность — клетки дороже 1 ОП стоят на 0,5 ОП меньше" },
      3: { A: "Механизированная армия — ещё +2 ОП", B: "Высокая проходимость — сухопутная местность −1 ОП, минимум 0,5" }
    }
  },
  reconnaissance: {
    title: "🔭 Разведка",
    levels: {
      1: { A: "Дальние дозоры — +1 клетка обнаружения", B: "Маскировка — обнаружение этой армии −1 клетка" },
      2: { A: "Глубокая разведка — ещё +1 клетка", B: "Разведданные — видно HP обнаруженных армий" },
      3: { A: "Разведывательная служба — ещё +2 клетки", B: "Глубокая маскировка — ещё −2 клетки обнаружения" }
    }
  }
};

function trackChoice(army: ArmyView, branch: ArmyUpgradeBranch, level: UpgradeLevel): UpgradeVariant | undefined {
  const track = army.upgrades?.[branch];
  return level === 1 ? track?.level1 : level === 2 ? track?.level2 : track?.level3;
}

function ArmyUpgradePanel({
  army,
  enabled,
  onAction
}: {
  army: ArmyView;
  enabled: boolean;
  onAction(command: UiCommand): void;
}) {
  const experience = army.experience ?? 0;
  const thirdLevelTaken = (["recovery", "motorization", "reconnaissance"] as ArmyUpgradeBranch[])
    .some((branch) => trackChoice(army, branch, 3) !== undefined);

  return (
    <details className="army-more">
      <summary>Прокачка · опыт {experience}</summary>
      <div className="army-control-groups">
        {(Object.keys(ARMY_UPGRADES) as ArmyUpgradeBranch[]).map((branch) => (
          <div key={branch} className="hp-editor">
            <strong>{ARMY_UPGRADES[branch].title}</strong>
            {([1, 2, 3] as UpgradeLevel[]).map((level) => {
              const selected = trackChoice(army, branch, level);
              const prerequisite = level === 1 || trackChoice(army, branch, (level - 1) as UpgradeLevel) !== undefined;
              const cost = level;
              const lockedByThird = level === 3 && thirdLevelTaken && selected === undefined;
              if (selected) {
                return (
                  <p className="helper-text" key={level}>
                    {["I", "II", "III"][level - 1]}-{selected}: {ARMY_UPGRADES[branch].levels[level][selected]}
                  </p>
                );
              }
              return (
                <div className="card-actions" key={level}>
                  <span className="helper-text">{["I", "II", "III"][level - 1]} ур. · {cost} XP</span>
                  {(["A", "B"] as UpgradeVariant[]).map((variant) => (
                    <button
                      className="button subtle"
                      type="button"
                      key={variant}
                      disabled={!enabled || !prerequisite || lockedByThird || experience < cost}
                      title={ARMY_UPGRADES[branch].levels[level][variant]}
                      onClick={() => onAction({
                        type: "PURCHASE_ARMY_UPGRADE",
                        armyId: army.id,
                        branch,
                        level,
                        variant
                      })}
                    >
                      {variant}: {ARMY_UPGRADES[branch].levels[level][variant]}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}

interface ArmyCardProps {
  army: ArmyView;
  sideColor?: string;
  isGM: boolean;
  canEditRoute: boolean;
  canRequestDisband: boolean;
  onAction(command: UiCommand): void;
}

function ArmyHealthEditor({ army, onAction }: { army: ArmyView; onAction(command: UiCommand): void }) {
  const [draft, setDraft] = useState(String(army.healthHp));
  const [maxDraft, setMaxDraft] = useState(String(army.healthMaxHp));
  useEffect(() => setDraft(String(army.healthHp)), [army.healthHp]);
  useEffect(() => setMaxDraft(String(army.healthMaxHp)), [army.healthMaxHp]);
  const parsed = Number(draft);
  const parsedMax = Number(maxDraft);
  const canSubmit = draft.trim().length > 0
    && Number.isInteger(parsed)
    && parsed >= 0
    && Number.isInteger(parsedMax)
    && parsedMax > 0
    && (parsed <= parsedMax || parsedMax !== army.healthMaxHp)
    && (parsed !== army.healthHp || parsedMax !== army.healthMaxHp);
  const setHp = () => {
    if (!canSubmit) return;
    onAction({ type: "SET_ARMY_HP", armyId: army.id, hp: Math.min(parsed, parsedMax), maxHp: parsedMax });
  };
  return (
    <div className="hp-editor" aria-label="Управление HP">
      <div className="hp-editor-heading"><strong>HP армии</strong><span>{army.healthHp} / {army.healthMaxHp}</span></div>
      <input
        aria-label={`Текущее HP ${army.name}`}
        type="number"
        min="0"
        max={parsedMax}
        step="1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <label>Максимум HP
        <input aria-label={`Максимальное HP ${army.name}`} type="number" min="1" step="1" value={maxDraft} onChange={(event) => setMaxDraft(event.target.value)} />
      </label>
      <button className="button subtle wide" type="button" disabled={!canSubmit} onClick={setHp}>Зафиксировать</button>
    </div>
  );
}

export function ArmyCard({ army, sideColor = "#687F91", isGM, canEditRoute, canRequestDisband, onAction }: ArmyCardProps) {
  const canChangeRoute = canEditRoute && army.status === "READY" && !army.formationActive;
  const invalidMessage = movementDenialMessage(army.routeInvalidReason);
  const encirclementDamage = Math.ceil(army.healthMaxHp * 0.1);
  const hasRoute = army.routeCellCount > 0;
  return (
    <article className={`army-card wiki-card${!army.supplied ? " army-card-warning" : ""}`}>
      <span className="army-side-mark" style={{ backgroundColor: sideColor }} aria-hidden="true" />
      <div className="army-card-heading">
        <div className="army-identity">
          <h3>{army.name}</h3>
          <p>{army.sideName}</p>
        </div>
        <div className="status-stack">
          <span className={`status status-${army.status.toLowerCase()}`}>{STATUS[army.status]}</span>
          {army.atWar && <span className="status status-war">Война</span>}
        </div>
      </div>

      <div className="army-stat-row" aria-label="Параметры армии">
        <div className="army-stat"><span>♥ HP</span><strong>{army.healthHp} / {army.healthMaxHp}</strong></div>
        <div className="army-stat"><span>⬡ ОП</span><strong>{formatMovementUnits(army.movementRemainingUnits)} / {formatMovementUnits(army.movementMaxUnits)}</strong></div>
      </div>

      <div className="army-state-line">
        <span className={army.supplied ? "state-good" : "state-warning"}>{army.supplied ? "✓ Снабжение" : "⚠ Окружена"}</span>
        <span>{hasRoute ? `Маршрут: ${formatMovementUnits(army.routeCostUnits)} ОП` : "Маршрут не задан"}</span>
      </div>
      {army.formationActive ? <p className="route-warning">Комплектуется: {army.healthHp} / {army.healthMaxHp} HP. Передвижение недоступно.</p> : null}
      <p className="helper-text">Опыт: {army.experience ?? 0}</p>
      {army.cell ? <p className="helper-text">Клетка: {army.cell.x},{army.cell.y} <button type="button" onClick={() => void navigator.clipboard?.writeText(`${army.cell?.x},${army.cell?.y}`)}>Копировать</button></p> : null}

      {!army.supplied && <p className="route-warning">В начале следующего хода: −{encirclementDamage} HP. Лечение недоступно.</p>}
      {army.forcedExitStartedOnTurn !== undefined && (
        <p className="route-warning">⚠ Обязательный выход с хода {army.forcedExitStartedOnTurn}. Проложите кратчайший путь на разрешённую территорию.</p>
      )}
      {army.disbandPending && <p className="route-warning">⚠ Будет распущена в начале следующего хода. Отменить роспуск нельзя.</p>}
      {army.routeRequiresReplan && <p className="route-warning">⚠ Старый маршрут нужно проложить заново по стратегической сетке.</p>}
      {invalidMessage && <p className="route-warning">⚠ {invalidMessage}</p>}

      {canEditRoute && army.formationActive && (() => {
        const remainingCap = Math.max(0, (army.formationTurnCap ?? 10) - (army.formationHpAddedThisTurn ?? 0));
        const hp = Math.min(remainingCap, Math.max(0, army.healthMaxHp - army.healthHp));
        return hp > 0 ? (
          <div className="card-actions primary-card-action">
            <button
              className="button primary wide"
              type="button"
              onClick={() => onAction({ type: "FORM_ARMY", armyId: army.id, hp })}
            >
              Комплектовать армию (+{hp} HP)
            </button>
          </div>
        ) : <p className="helper-text">Лимит комплектования на этот ход исчерпан.</p>;
      })()}

      {canChangeRoute && (
        <div className="card-actions primary-card-action" aria-label="Маршрут армии">
          <button className="button primary wide" type="button" onClick={() => onAction({ type: "EDIT_ROUTE", armyId: army.id })}>{hasRoute ? "Изменить маршрут" : "Проложить маршрут"}</button>
          {army.route.length > 0 && <button className="button ghost" type="button" onClick={() => onAction({ type: "CLEAR_ROUTE", armyId: army.id })}>Очистить</button>}
        </div>
      )}

      {canEditRoute && army.supplied && army.status !== "IN_BATTLE" && !army.formationActive && army.healthHp < army.healthMaxHp && (
        <div className="card-actions"><button className="button subtle" type="button" onClick={() => onAction({ type: "HEAL_ARMY", armyId: army.id, amount: 1 })}>Восстановить максимум доступных HP</button></div>
      )}

      <ArmyUpgradePanel army={army} enabled={canEditRoute} onAction={onAction} />

      {(isGM || canRequestDisband) && (
        <details className="army-more">
          <summary>Управление</summary>
          <div className="army-control-groups">
            {isGM && <ArmyHealthEditor army={army} onAction={onAction} />}
            {isGM && (army.status === "MOVING" || army.status === "PAUSED") && <div className="card-actions" aria-label="Движение армии">{army.status === "MOVING" && <button type="button" onClick={() => onAction({ type: "PAUSE_ARMY", armyId: army.id })}>Пауза</button>}<button type="button" onClick={() => onAction({ type: "STOP_ARMY", armyId: army.id })}>Стоп</button></div>}
            {canRequestDisband && !army.disbandPending && <div className="card-actions"><button className="button danger subtle" type="button" onClick={() => onAction({ type: "REQUEST_ARMY_DISBAND", armyId: army.id })}>Распустить армию</button></div>}
            {isGM && <div className="card-actions"><button className="button ghost" type="button" onClick={() => onAction({ type: "UNREGISTER_ARMY", armyId: army.id })}>Снять регистрацию</button></div>}
          </div>
        </details>
      )}
    </article>
  );
}
