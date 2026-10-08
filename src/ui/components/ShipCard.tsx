import { useEffect, useState } from "react";
import type { ShipClassId, ShipFacing, SideRelation, UpgradeLevel, UpgradeVariant } from "../../shared/types";
import type { ShipView, UiCommand } from "../state/useExtensionState";

const FACING_LABELS: Record<ShipFacing, string> = {
  NORTH: "Север",
  EAST: "Восток",
  SOUTH: "Юг",
  WEST: "Запад"
};


const SHIP_UPGRADES: Record<ShipClassId, Record<UpgradeLevel, Record<UpgradeVariant, string>>> = {
  BATTLESHIP: {
    1: { A: "Усиленный корпус — +5 максимальных HP", B: "Улучшенные машины — +1 ОП" },
    2: { A: "Усиленное бронирование — +1 брони", B: "Наблюдательные посты — +1 клетка обнаружения" },
    3: { A: "Тяжёлая артиллерия — +1 кубик урона", B: "Дальнобойная артиллерия — +1 к максимальной дальности" }
  },
  CRUISER: {
    1: { A: "Форсированные машины — +1 ОП", B: "Усиленное наблюдение — +1 клетка обнаружения" },
    2: { A: "Усиленный корпус — +5 максимальных HP", B: "Броневой пояс — +1 брони" },
    3: { A: "Усиленное вооружение — +1 кубик урона", B: "Высокая скорость — ещё +2 ОП" }
  },
  IRONCLAD: {
    1: { A: "Усиленный корпус — +5 максимальных HP", B: "Мощные машины — +1 ОП" },
    2: { A: "Тяжёлая броня — +1 брони", B: "Дополнительные орудия — +1 кубик урона" },
    3: { A: "Сверхтяжёлая броня — ещё +1 брони", B: "Тяжёлый залп — ещё +1 кубик урона" }
  },
  HOSPITAL: {
    1: { A: "Усиленный корпус — +5 максимальных HP", B: "Быстроходное судно — +1 ОП" },
    2: { A: "Защищённое судно — +1 брони", B: "Расширенный лазарет — поддержка +1d6 временных HP" },
    3: { A: "Крупный госпиталь — поддержка ещё +1d6", B: "Дальняя поддержка — радиус поддержки до 2 клеток" }
  },
  TRANSPORT: {
    1: { A: "Усиленный корпус — +5 максимальных HP", B: "Быстроходный транспорт — +1 ОП" },
    2: { A: "Броневая защита — +1 брони", B: "Наблюдательные посты — +1 клетка обнаружения" },
    3: { A: "Увеличенная вместимость — перевозка 2 армий", B: "Бесплатная погрузка — погрузка и выгрузка без ОП" }
  }
};

function shipUpgradeChoice(ship: ShipView, level: UpgradeLevel): UpgradeVariant | undefined {
  return level === 1 ? ship.upgrades?.level1 : level === 2 ? ship.upgrades?.level2 : ship.upgrades?.level3;
}

function ShipUpgradePanel({
  ship,
  enabled,
  onAction
}: {
  ship: ShipView;
  enabled: boolean;
  onAction(command: UiCommand): void;
}) {
  const experience = ship.experience ?? 0;
  return (
    <details className="army-more ship-management">
      <summary>Прокачка · опыт {experience}</summary>
      <div className="army-control-groups">
        {([1, 2, 3] as UpgradeLevel[]).map((level) => {
          const selected = shipUpgradeChoice(ship, level);
          const prerequisite = level === 1 || shipUpgradeChoice(ship, (level - 1) as UpgradeLevel) !== undefined;
          const cost = level;
          if (selected) {
            return (
              <p className="helper-text" key={level}>
                {["I", "II", "III"][level - 1]}-{selected}: {SHIP_UPGRADES[ship.classId][level][selected]}
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
                  disabled={!enabled || !prerequisite || experience < cost}
                  title={SHIP_UPGRADES[ship.classId][level][variant]}
                  onClick={() => onAction({
                    type: "PURCHASE_SHIP_UPGRADE",
                    shipId: ship.id,
                    level,
                    variant
                  })}
                >
                  {variant}: {SHIP_UPGRADES[ship.classId][level][variant]}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function clampHp(value: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, Math.round(value)));
}

function ShipDetectionEditor({
  ship,
  onAction
}: {
  ship: ShipView;
  onAction(command: UiCommand): void;
}) {
  const [draft, setDraft] = useState(String(ship.effectiveDetectionRange));
  useEffect(() => setDraft(String(ship.effectiveDetectionRange)), [ship.effectiveDetectionRange]);
  const parsed = Number(draft);
  const canSubmit =
    draft.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    (ship.detectionOverride === null || parsed !== ship.detectionOverride);

  return (
    <div className="hp-editor" aria-label="Управление дальностью обнаружения корабля">
      <div className="hp-editor-heading">
        <strong>Дальность обнаружения</strong>
        <span>
          {ship.detectionOverride === null
            ? `Общая дальность: ${ship.effectiveDetectionRange} кл.`
            : `Индивидуальная: ${ship.effectiveDetectionRange} кл.`}
        </span>
      </div>
      <input
        aria-label={`Дальность обнаружения ${ship.name}`}
        type="number"
        min="0"
        step="any"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        className="button subtle wide"
        type="button"
        disabled={!canSubmit}
        onClick={() => onAction({
          type: "SET_SHIP_DETECTION_OVERRIDE",
          shipId: ship.id,
          detectionOverride: parsed
        })}
      >
        Установить дальность обнаружения
      </button>
      <button
        className="button subtle wide"
        type="button"
        disabled={ship.detectionOverride === null}
        onClick={() => onAction({
          type: "SET_SHIP_DETECTION_OVERRIDE",
          shipId: ship.id,
          detectionOverride: null
        })}
      >
        Использовать общую дальность
      </button>
    </div>
  );
}

function ShipHealthEditor({
  ship,
  onAction
}: {
  ship: ShipView;
  onAction(command: UiCommand): void;
}) {
  const [draft, setDraft] = useState(String(ship.hp));
  useEffect(() => setDraft(String(ship.hp)), [ship.hp]);
  const parsed = Number(draft);
  const canSubmit =
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= ship.maxHp &&
    parsed !== ship.hp;
  const setHp = (hp: number) =>
    onAction({ type: "SET_SHIP_HP", shipId: ship.id, hp: clampHp(hp, ship.maxHp) });

  return (
    <div className="hp-editor" aria-label="Управление HP корабля">
      <div className="hp-editor-heading">
        <strong>HP корабля</strong>
        <span>{ship.hp} / {ship.maxHp}</span>
      </div>
      <div className="hp-quick-actions">
        <button type="button" aria-label="-5 HP корабля" onClick={() => setHp(ship.hp - 5)}>−5</button>
        <button type="button" aria-label="-1 HP корабля" onClick={() => setHp(ship.hp - 1)}>−1</button>
        <input
          aria-label={`Текущее HP ${ship.name}`}
          type="number"
          min="0"
          max={ship.maxHp}
          step="1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" aria-label="+1 HP корабля" onClick={() => setHp(ship.hp + 1)}>+1</button>
        <button type="button" aria-label="+5 HP корабля" onClick={() => setHp(ship.hp + 5)}>+5</button>
      </div>
      <button
        className="button subtle wide"
        type="button"
        disabled={!canSubmit}
        onClick={() => setHp(parsed)}
      >
        Установить HP корабля
      </button>
    </div>
  );
}

export function ShipCard({
  ship,
  sideColor,
  isGM,
  canPlanRoute,
  canRepair = false,
  routePlanningEnabled = true,
  embarkedArmyName,
  additionalEmbarkedArmyName,
  relations = {},
  onAction
}: {
  ship: ShipView;
  sideColor: string;
  isGM: boolean;
  canPlanRoute: boolean;
  canRepair?: boolean;
  routePlanningEnabled?: boolean;
  embarkedArmyName?: string;
  additionalEmbarkedArmyName?: string;
  relations?: Readonly<Record<string, Readonly<Record<string, SideRelation>>>>;
  onAction(command: UiCommand): void;
}) {
  const destroyed = ship.hp <= 0;
  const exited = ship.navalExited === true;
  const inBattle = ship.status === "IN_NAVAL_BATTLE";
  const broadside = ship.normalDice > 0
    ? `${ship.normalDice}d6 · дальность ${ship.normalRangeMin === ship.normalRangeMax ? ship.normalRangeMin : `${ship.normalRangeMin}–${ship.normalRangeMax}`}`
    : "Обычный залп недоступен";
  const hasPlannedRoute = ship.plannedRouteCellCount > 0;
  const route = hasPlannedRoute
    ? `Маршрут: ${ship.plannedRouteCellCount} кл.`
    : "Маршрут не задан";
  const routeUnavailable = destroyed || inBattle || (!hasPlannedRoute && ship.movementRemaining <= 0);
  const canControlTactical = canPlanRoute && !destroyed && !exited && inBattle && ship.isCurrentNavalTurn === true;
  const canConfirmExit = isGM && !destroyed && !exited && inBattle && ship.isCurrentNavalTurn === true;
  const broadsideTargets = ship.broadsideTargets ?? [];
  const [broadsideTargetId, setBroadsideTargetId] = useState("");
  const selectedBroadsideTargetId = broadsideTargets.some((target) => target.id === broadsideTargetId)
    ? broadsideTargetId
    : (broadsideTargets[0]?.id ?? "");
  const selectedBroadsideTarget = broadsideTargets.find((target) => target.id === selectedBroadsideTargetId);
  const canUseBroadside =
    canControlTactical &&
    ship.normalDice > 0 &&
    ship.navalActionUsed !== true &&
    selectedBroadsideTarget !== undefined;
  const hospitalSupportTargets = ship.hospitalSupportTargets ?? [];
  const [hospitalTargetId, setHospitalTargetId] = useState("");
  const selectedHospitalTargetId = hospitalSupportTargets.some((target) => target.id === hospitalTargetId)
    ? hospitalTargetId
    : (hospitalSupportTargets[0]?.id ?? "");
  const canUseHospitalSupport =
    canControlTactical &&
    ship.classId === "HOSPITAL" &&
    ship.navalActionUsed !== true &&
    selectedHospitalTargetId !== "";
  const shoreBombardmentTargets = ship.shoreBombardmentTargets ?? [];
  const [shoreBombardmentTargetId, setShoreBombardmentTargetId] = useState("");
  const selectedShoreBombardmentTargetId = shoreBombardmentTargets.some(
    (target) => target.id === shoreBombardmentTargetId
  )
    ? shoreBombardmentTargetId
    : (shoreBombardmentTargets[0]?.id ?? "");
  const selectedShoreBombardmentTarget = shoreBombardmentTargets.find(
    (target) => target.id === selectedShoreBombardmentTargetId
  );
  const shoreBombardmentDice =
    ship.classId === "BATTLESHIP" || ship.classId === "CRUISER" ? ship.normalDice : 0;
  const canUseShoreBombardment =
    canPlanRoute &&
    !destroyed &&
    !inBattle &&
    shoreBombardmentDice > 0 &&
    selectedShoreBombardmentTarget !== undefined;
  const tacticalMovementDisabled =
    (ship.navalMovementRemaining ?? 0) <= 0 || ship.navalActionUsed === true;
  const statusClass = destroyed
    ? "status-destroyed"
    : exited
      ? "status-exited"
      : inBattle
        ? "status-in_battle"
        : "status-ready";
  const statusText = destroyed
    ? "Уничтожен"
    : exited
      ? "Вышел из боя"
      : inBattle
        ? "В морском бою"
        : "Готов";

  return (
    <article className={`ship-card${inBattle ? " ship-card-battle" : ""}`}>
      <span className="ship-accent" style={{ background: sideColor }} aria-hidden="true" />
      <div className="ship-card-heading">
        <div className="ship-identity">
          <h3 style={{ color: sideColor }}>{ship.name}</h3>
          <p><strong>{ship.className}</strong> · {ship.sideName}</p>
        </div>
        <span className={`status ${statusClass}`}>
          {statusText}
        </span>
      </div>

      <div className="ship-stat-grid" aria-label={`Параметры корабля ${ship.name}`}>
        <div><span>Прочность</span><strong>{ship.hp} / {ship.maxHp} HP</strong>{ship.temporaryHp > 0 && <small>+{ship.temporaryHp} врем.</small>}</div>
        <div><span>Броня</span><strong>{ship.armor}</strong></div>
        <div><span>ОП</span><strong>{ship.movementRemaining} / {ship.movementMax} ОП</strong></div>
      </div>

      {canControlTactical && (
        <div className="ship-tactical-panel" aria-label={`Тактическое управление ${ship.name}`}>
          <div className="ship-tactical-status">
            Раунд {ship.navalRoundNumber ?? "?"} · ОП {ship.navalMovementRemaining ?? 0}
          </div>
          <div className="card-actions ship-tactical-actions">
            <button
              className="button ghost"
              type="button"
              disabled={tacticalMovementDisabled}
              onClick={() => onAction({ type: "NAVAL_TURN_SHIP", shipId: ship.id, direction: "LEFT" })}
            >
              Повернуть влево
            </button>
            <button
              className="button primary"
              type="button"
              disabled={tacticalMovementDisabled}
              onClick={() => onAction({ type: "NAVAL_MOVE_FORWARD", shipId: ship.id })}
            >
              Вперёд
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={tacticalMovementDisabled}
              onClick={() => onAction({ type: "NAVAL_TURN_SHIP", shipId: ship.id, direction: "RIGHT" })}
            >
              Повернуть вправо
            </button>
          </div>
          {ship.normalDice > 0 && broadsideTargets.length > 0 && (
            <div className="ship-hospital-support ship-broadside-control" aria-label={`Бортовой залп ${ship.name}`}>
              <select
                aria-label={`Цель бортового залпа ${ship.name}`}
                value={selectedBroadsideTargetId}
                onChange={(event) => setBroadsideTargetId(event.target.value)}
              >
                {broadsideTargets.map((target) => (
                  <option key={target.id} value={target.id}>{target.name} — {target.sideName}</option>
                ))}
              </select>
              <button
                className="button primary wide"
                type="button"
                disabled={!canUseBroadside}
                onClick={() => {
                  if (!canUseBroadside || !selectedBroadsideTarget) return;
                  const relation = relations[ship.sideId]?.[selectedBroadsideTarget.sideId];
                  const friendlyFireConfirmed = ship.sideId === selectedBroadsideTarget.sideId || relation === "ALLY";
                  if (
                    friendlyFireConfirmed &&
                    !window.confirm(
                      `Цель «${selectedBroadsideTarget.name}» относится к своей или союзной стороне. Подтвердить бортовой залп?`
                    )
                  ) return;
                  onAction({
                    type: "NAVAL_BROADSIDE_ATTACK",
                    shipId: ship.id,
                    targetShipId: selectedBroadsideTarget.id,
                    friendlyFireConfirmed
                  });
                }}
              >
                Бортовой залп ({ship.normalDice}d6)
              </button>
            </div>
          )}
          {ship.classId === "CRUISER" && (
            <button
              className="button primary wide"
              type="button"
              disabled={ship.navalActionUsed === true}
              onClick={() => onAction({ type: "NAVAL_ACTIVATE_INTERCEPTION", shipId: ship.id })}
            >
              Перехват
            </button>
          )}
          {ship.classId === "HOSPITAL" && hospitalSupportTargets.length > 0 && (
            <div className="ship-hospital-support" aria-label={`Поддержка госпитального судна ${ship.name}`}>
              <select
                aria-label={`Цель госпитального судна ${ship.name}`}
                value={selectedHospitalTargetId}
                onChange={(event) => setHospitalTargetId(event.target.value)}
              >
                {hospitalSupportTargets.map((target) => (
                  <option key={target.id} value={target.id}>{target.name} — {target.sideName}</option>
                ))}
              </select>
              <button
                className="button primary wide"
                type="button"
                disabled={!canUseHospitalSupport}
                onClick={() => {
                  if (!canUseHospitalSupport) return;
                  onAction({
                    type: "NAVAL_HOSPITAL_SUPPORT",
                    shipId: ship.id,
                    targetShipId: selectedHospitalTargetId
                  });
                }}
              >
                Оказать поддержку ({ship.hospitalSupportDice ?? 2}d6)
              </button>
            </div>
          )}
          <button
            className="button subtle wide"
            type="button"
            onClick={() => onAction({ type: "END_NAVAL_SHIP_TURN", shipId: ship.id })}
          >
            Завершить ход
          </button>
        </div>
      )}

      {canConfirmExit && (
        <div className="card-actions ship-exit-actions">
          <button
            className="button subtle wide"
            type="button"
            onClick={() => onAction({ type: "CONFIRM_NAVAL_SHIP_EXIT", shipId: ship.id })}
          >
            Подтвердить выход из боя
          </button>
        </div>
      )}

      {canPlanRoute && shoreBombardmentTargets.length > 0 && shoreBombardmentDice > 0 && (
        <div className="ship-hospital-support ship-shore-bombardment" aria-label={`Береговой обстрел ${ship.name}`}>
          <select
            aria-label={`Цель берегового обстрела ${ship.name}`}
            value={selectedShoreBombardmentTargetId}
            onChange={(event) => setShoreBombardmentTargetId(event.target.value)}
          >
            {shoreBombardmentTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.name} — {target.sideName}</option>
            ))}
          </select>
          <button
            className="button primary wide"
            type="button"
            disabled={!canUseShoreBombardment}
            onClick={() => {
              if (!canUseShoreBombardment || !selectedShoreBombardmentTarget) return;
              const relation = relations[ship.sideId]?.[selectedShoreBombardmentTarget.sideId];
              const friendlyFireConfirmed =
                ship.sideId === selectedShoreBombardmentTarget.sideId || relation === "ALLY";
              if (
                friendlyFireConfirmed &&
                !window.confirm(
                  `Цель «${selectedShoreBombardmentTarget.name}» относится к своей или союзной стороне. Подтвердить береговой обстрел?`
                )
              ) return;
              onAction({
                type: "NAVAL_SHORE_BOMBARDMENT",
                shipId: ship.id,
                armyId: selectedShoreBombardmentTarget.id,
                friendlyFireConfirmed
              });
            }}
          >
            Береговой обстрел ({shoreBombardmentDice}d6)
          </button>
        </div>
      )}

      {canPlanRoute && routePlanningEnabled && (
        <div className="card-actions ship-route-actions">
          <button
            className="button primary"
            type="button"
            disabled={routeUnavailable}
            onClick={() => onAction({ type: "EDIT_SHIP_ROUTE", shipId: ship.id })}
          >
            {hasPlannedRoute ? "Изменить переход" : "Проложить переход"}
          </button>
        </div>
      )}

      {canRepair && !destroyed && (
        <div className="card-actions ship-repair-actions">
          <button
            className="button subtle wide"
            type="button"
            onClick={() => onAction({ type: "REPAIR_SHIP_AT_SHIPYARD", shipId: ship.id, amount: 10 })}
          >
            Ремонт на верфи (+10 HP)
          </button>
        </div>
      )}

      <details className="army-more ship-additional">
        <summary>Характеристики и улучшения</summary>
      <div className="ship-facts">
        <span><strong>Курс</strong>{FACING_LABELS[ship.facing]}</span>
        <span><strong>Бортовой залп</strong>{broadside}</span>
        <span><strong>Переход</strong>{route}</span>
        {ship.embarkedArmyId && <span><strong>На борту</strong>{embarkedArmyName ?? "Перевозимая армия"}</span>}
        {ship.additionalEmbarkedArmyId && <span><strong>На борту II</strong>{additionalEmbarkedArmyName ?? "Перевозимая армия"}</span>}
        <span><strong>Опыт</strong>{ship.experience ?? 0}</span>
      </div>

      <ShipUpgradePanel ship={ship} enabled={canPlanRoute} onAction={onAction} />
      </details>

      {isGM && (
        <details className="army-more ship-management">
          <summary>Управление</summary>
          <div className="army-control-groups">
            <ShipHealthEditor ship={ship} onAction={onAction} />
            <ShipDetectionEditor ship={ship} onAction={onAction} />
            <div className="card-actions">
              <button className="button danger subtle" type="button" onClick={() => onAction({ type: "UNREGISTER_SHIP", shipId: ship.id })}>
                Снять регистрацию
              </button>
            </div>
          </div>
        </details>
      )}
    </article>
  );
}
