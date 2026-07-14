# Metadata «Летопись: Армии»

Все ключи принадлежат namespace `com.letopis.army-control`. Неизвестные поля при нормализации не сохраняются. Текущая версия схем — `1`; будущие версии открываются только для чтения и не перезаписываются.

## Scene metadata

Ключ: `com.letopis.army-control/scene`.

```ts
interface SceneState {
  version: 1;
  revision: number;
  settings: SceneSettings;
  sides: Side[];
  relations: Record<sideId, Record<sideId, "ALLY" | "NEUTRAL" | "ENEMY">>;
  battleGroups: BattleGroup[];
  coordinatorLease?: {
    connectionId: string;
    epoch: number;
    expiresAt: number;
  };
}
```

`revision` используется request/ack gateway для отклонения устаревших команд. Отношения записываются симметрично.

### SceneSettings

| Поле | Значение по умолчанию | Назначение |
|---|---:|---|
| `defaultDetectionRangeCells` | `6` | Дальность обнаружения |
| `defaultSpeedCellsPerSecond` | `0.25` | Скорость движения |
| `defaultCollisionRangeCells` | `0.5` | Радиус контакта |
| `defaultMaxRouteDistanceCells` | `5` | Лимит маршрута |
| `detectionMode` | `INDEPENDENT` | `INDEPENDENT` или `MUTUAL` |
| `visibilityRecalculationMode` | `ON_DROP` | `ON_DROP` или `REALTIME` |
| `allowPlayersToCreateRoutes` | `true` | Маршруты владельцев |
| `allowPlayersToStartOwnArmies` | `true` | Управление движением владельцем |
| `movementUpdateRate` | `5` | Авторитетных тиков в секунду |
| `visibilityUpdateRate` | `4` | Пересчётов видимости в секунду |
| `interpolationEnabled` | `true` | Local-сглаживание |

### Side

`id`, `name`, `color`, уникальный массив `playerIds`.

### BattleGroup

`battleId`, отсортированный массив `participantIds`, `revision`.

## Army item metadata

Ключ: `com.letopis.army-control/army` на source Image.

```ts
interface ArmyState {
  version: 1;
  registered: true;
  sideId: string;
  status: "READY" | "MOVING" | "PAUSED" | "IN_BATTLE";
  overrides: {
    detectionRangeCells?: number;
    speedCellsPerSecond?: number;
    collisionRangeCells?: number;
    maxRouteDistanceCells?: number;
  };
  route: Array<{ x: number; y: number }>;
  currentWaypointIndex: number;
  segmentProgressCells: number;
  ignoresMovementBarriers: boolean;
  ignoresVisionBarriers: boolean;
  revision: number;
  directOwnerPlayerId?: string;
  battleGroupId?: string;
  stopReason?: "BARRIER" | "COORDINATOR_GAP" | "MANUAL" | "ARRIVED";
}
```

Зарегистрированный source Image имеет `visible: false`. Unregister удаляет только этот ключ и восстанавливает `visible: true`.

## Barrier item metadata

Ключ: `com.letopis.army-control/barrier` на скрытом заблокированном Curve.

Поля: `version`, `revision`, `blocksMovement`, `blocksVision`, `visibility` (`GM_ONLY` или `EVERYONE`), `color`.

## Local metadata

Эти ключи используются только на local items текущего клиента:

- `com.letopis.army-control/local-clone`: `{ sourceItemId }` для Image-клона;
- `com.letopis.army-control/route-overlay`: `{ armyId, kind, index? }`;
- `com.letopis.army-control/barrier-overlay`: `{ barrierId }`.

Local items можно восстановить из source items и metadata; они не являются авторитетным состоянием.

## Миграции

Схемы `version: 0` последовательно переводятся в `1`. Для армии `IDLE` становится `READY`, добавляются независимые barrier exceptions. Старый единый флаг барьера `blocks` заполняет оба новых флага. `version > 1` возвращает `FUTURE_VERSION` и никогда не перезаписывается.
