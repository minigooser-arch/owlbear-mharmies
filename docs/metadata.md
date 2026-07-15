# Metadata «Летопись: Армии»

Все ключи принадлежат namespace `com.letopis.army-control`. Неизвестные поля при нормализации не сохраняются. Текущая версия scene-схемы — `2`; схемы армии и барьера остаются на версии `1`. Будущие версии открываются только для чтения и не перезаписываются.

## Scene metadata

Ключ: `com.letopis.army-control/scene`.

```ts
interface SceneState {
  version: 2;
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
| `allowPlayersToCreateRoutes` | `true` | Унаследованное поле, не участвует в авторизации |
| `allowPlayersToStartOwnArmies` | `true` | Унаследованное поле, не участвует в авторизации |
| `movementUpdateRate` | `5` | Авторитетных тиков в секунду |
| `visibilityUpdateRate` | `4` | Пересчётов видимости в секунду |
| `interpolationEnabled` | `true` | Local-сглаживание |

Поля `allowPlayersToCreateRoutes` и `allowPlayersToStartOwnArmies` сохраняются только для чтения старых комнат. В версии 2 они не дают прав: маршруты задают GM и лидеры стороны, а движением управляет только GM.

### Side

```ts
interface Side {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  leaderPlayerIds: string[];
}
```

Оба массива содержат внутренние Owlbear `Player.id`, а не отображаемые имена. Значения уникальны, каждый `leaderPlayerIds` также присутствует в `playerIds`; один ID может входить в несколько сторон.

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

`directOwnerPlayerId` читается только как унаследованное поле ArmyState v1. Оно не выдаёт никаких прав, не показывается в UI и не записывается при новой регистрации.

Зарегистрированный source Image имеет `visible: false`. Unregister удаляет только этот ключ и восстанавливает `visible: true`.

## Barrier item metadata

Ключ: `com.letopis.army-control/barrier` на скрытом заблокированном Curve.

Поля: `version`, `revision`, `blocksMovement`, `blocksVision`, `visibility` (`GM_ONLY` или `EVERYONE`), `color`.

## Local metadata

Эти ключи используются только на local items текущего клиента:

- `com.letopis.army-control/local-clone`: `{ sourceItemId }` для Image-клона;
- `com.letopis.army-control/route-overlay`: `{ armyId, kind, index? }`;
- `com.letopis.army-control/route-preview`: черновая линия и подписи активного инструмента маршрута;
- `com.letopis.army-control/barrier-overlay`: `{ barrierId }`.

Local items можно восстановить из source items и metadata; они не являются авторитетным состоянием.

## Миграции

Scene-схемы `version: 0` и `version: 1` последовательно переводятся в `2`; сторонам добавляется `leaderPlayerIds: []`. Для армии `IDLE` становится `READY`, добавляются независимые barrier exceptions. Старый единый флаг барьера `blocks` заполняет оба новых флага. Scene `version > 2` и army/barrier `version > 1` возвращают `FUTURE_VERSION` и никогда не перезаписываются.
