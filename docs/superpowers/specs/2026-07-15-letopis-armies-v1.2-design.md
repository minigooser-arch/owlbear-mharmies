# «Летопись: Армии» 1.2 — дизайн

## Статус

Утверждено в разговоре 2026-07-15. Выбран вариант 2: полное исправление границ данных, маршрутов, жизненного цикла background и обновления интерфейса.

## Цель релиза

Выпустить `1.2.0`, в которой:

- список армий не раскрывает игроку армии чужих сторон;
- создавать и снимать регистрацию армий может только GM;
- маршрут строится исключительно между центрами клеток и физически центрирует токен;
- максимальная длина маршрута ограничивает курсор без красного «перетягивания»;
- карта и React-popover не мерцают от циклического удаления элементов и конкурирующих refresh;
- активные бои получают изменяемые GM названия;
- command/ACK-контур не превращает несовместимость background в постоянный безымянный таймаут;
- расширение использует новую прозрачную PNG-иконку с пиксельным мечом без букв `RP`.

## Выбранный подход

### Рассмотренные варианты

1. Локально исправить фильтр, цвет линейки и manifest. Это быстрее, но оставляет разрушительный delete/add overlays, конкурирующие refresh и хрупкий command lifecycle.
2. Разделить политики списка и карты, добавить grid-center сервис, дифференциальный reconcile, сериализованный refresh и версионированный протокол. Это выбранный вариант.
3. Переписать маршрут на нативный Owlbear Ruler. Он хуже подходит для маршрута из нескольких точек, общего лимита и пользовательских подписей.

## Версии и совместимость

- Версия приложения в `package.json`, `package-lock.json` и Owlbear manifest становится `1.2.0`.
- `manifest_version` остаётся `1`: это версия формата Owlbear manifest, а не приложения.
- URL popover и background получают cache-busting `?v=1.2.0`.
- Иконка публикуется как версионированный файл `icon-1.2.png`, чтобы Owlbear не использовал старый cached asset.
- Scene metadata schema повышается с `2` до `3` из-за обязательного имени BattleGroup.
- Клиенты schema v2 мигрируют в v3. Клиенты, понимающие только v2, видят будущую схему как read-only и не могут стереть имена боёв.
- ArmyState и BarrierState сохраняют собственную schema version `1`.

## Приватность списка армий

Политика видимости на карте и политика содержимого UI становятся разными явными понятиями.

### Карта

`mapVisibleSourceIds` продолжает управлять local Image-клонами. GM видит всё; игрок видит собственные армии, обнаруженные армии и доступных участников боя по существующим правилам обнаружения. Этот релиз не меняет fog/detection механику карты.

### Списки и счётчики

Role-safe snapshot формирует `ArmyView[]` до передачи в React:

- GM получает все зарегистрированные армии;
- игрок получает только армии сторон, чьи `playerIds` содержат его внутренний Owlbear Player.id;
- игрок, состоящий в нескольких сторонах, получает объединение их армий;
- лидер автоматически считается участником стороны по существующему инварианту;
- обнаружение чужой армии и совместный BattleGroup не добавляют её в «Армии», «Движение» или нижние счётчики;
- фильтр сторон на странице армий строится только из разрешённых ArmyView, поэтому не предлагает пустые чужие стороны.

React не получает полный массив армий с последующей косметической фильтрацией. В `useExtensionState` остаётся повторная проверка membership как defense in depth.

## Права на создание армий

Только GM может выполнять `REGISTER_ARMY` и `UNREGISTER_ARMY`.

- Панель регистрации остаётся скрытой для PLAYER.
- Authoritative background повторно проверяет роль отправителя, полученную из Owlbear broadcast connection, независимо от UI.
- Поддельная PLAYER-команда регистрации возвращает `GM_ONLY`.
- Любой выбранный объект по-прежнему должен быть ровно одним незарегистрированным Image.

## Grid-center маршруты

### SDK-граница

Owlbear adapter получает операцию:

```ts
snapGridCenter(position: Vector2): Promise<Vector2>
```

Она вызывает:

```ts
OBR.scene.grid.snapPosition(position, 1, false, true)
```

`1` принудительно включает полный snap, corners выключены, center включён. Алгоритм остаётся совместимым с square, hex, isometric и dimetric grids, потому что координаты и расстояние вычисляет Owlbear SDK.

### Начальная позиция

- При `REGISTER_ARMY` authoritative coordinator физически перемещает Image в центр ближайшей клетки и сохраняет ArmyState в одной командной транзакции.
- Для уже зарегистрированной армии route session визуально начинается в центре её текущей клетки.
- При успешном `SET_ROUTE` существующая армия физически перемещается в этот центр. Поэтому первое сохранение нового маршрута мигрирует старую несцентрированную армию без отдельной массовой операции.
- Ошибка или отмена route tool не перемещает армию.

### Точки маршрута

- Каждое движение указателя сначала нормализуется в центр клетки.
- В route state и scene metadata никогда не записывается произвольная пиксельная точка.
- Повторный щелчок по текущей клетке не создаёт дубликат waypoint.
- Длина остаётся суммой `OBR.scene.grid.getDistance` по сегментам.

### Ограничение максимальной длины

Для уже зафиксированных сегментов вычисляется оставшийся лимит. Если snapped cell под указателем укладывается в него, preview использует эту клетку. Если не укладывается, чистая функция ищет наиболее дальний допустимый snapped center вдоль луча от последней точки к указателю:

1. интерполирует мировую координату двоичным поиском;
2. каждый кандидат повторно пропускает через `snapGridCenter`;
3. проверяет точное grid distance всего маршрута;
4. сохраняет самый дальний уникальный допустимый центр.

Preview никогда не выходит за лимит и остаётся зелёным. Подпись показывает `Осталось: 0`, когда достигнут максимум. Щелчок за пределами лимита фиксирует найденную максимальную клетку. Если не помещается даже следующая клетка, preview остаётся на текущем anchor и новый waypoint не добавляется.

Пересечение movement barrier остаётся отдельной ошибкой: такой preview красный и не фиксируется. Сначала применяется ограничение длины, затем проверяется отрезок до фактически выбранной клетки, поэтому препятствие за пределами лимита не влияет на маршрут.

Authoritative coordinator повторяет snap и полную проверку длины/барьеров перед записью, поэтому crafted command не может сохранить произвольные или слишком дальние координаты.

## Устранение мерцания карты

Причина текущего мерцания — route/barrier previews удаляются и создаются с новыми ID при каждом reconcile, оставляя видимый промежуток.

### Дифференциальный reconcile

Local overlays получают стабильные семантические ключи:

- route preview: `armyId + kind + waypointIndex`;
- persistent route: `armyId + kind + waypointIndex`;
- barrier: `barrierId`.

На каждом reconcile:

1. читаются существующие items;
2. неизменившиеся items не записываются;
3. изменившиеся обновляются на месте с сохранением ID;
4. недостающие добавляются batch-вызовом;
5. только после добавления удаляются устаревшие items.

Идентичный повторный reconcile выполняет ноль add/update/delete операций. Активная линейка обновляет одну Curve и одну distance Label вместо полного clear/recreate.

SDK adapter предоставляет batch add/update для local items. Route и barrier overlays используют общий небольшой reconciliation helper, а не дублируют destructive lifecycle.

## Устранение мерцания popover

Текущий popover запускает несколько параллельных `refresh()` из scene, local, metadata, player и party events. Старый запрос может завершиться позже нового и повторно опубликовать устаревший snapshot.

В 1.2 используется RefreshCoordinator:

- одновременно выполняется не больше одного refresh;
- события во время работы объединяются в один trailing refresh;
- lifecycle generation запрещает публикацию результата закрытой сцены;
- semantic equality сравнивает только данные, реально отображаемые в UI;
- неизменившийся snapshot не вызывает listeners и React render;
- route/barrier local overlay events не запускают popover refresh;
- `mapVisibleSourceIds` не участвует в фильтрации списка, поэтому local clone churn не дёргает UI.

Heartbeat metadata и координатные movement updates, не меняющие ArmyView, больше не перерисовывают весь popover.

## Имена боёв

BattleGroup schema v3:

```ts
interface BattleGroup {
  battleId: string;
  name: string;
  participantIds: string[];
  revision: number;
}
```

- Новые группы получают первое свободное имя `Бой N`, начиная с `Бой 1`.
- Миграция старых групп сортирует их по `battleId` и присваивает детерминированные `Бой 1`, `Бой 2`, ...
- Команда `RENAME_BATTLE_GROUP` содержит `battleId` и trimmed `name` длиной от 1 до 80 Unicode code points.
- Переименовывать может только GM.
- Успешное переименование увеличивает BattleGroup revision и Scene revision.
- При подкреплении имя существующей группы сохраняется.
- При объединении групп сохраняются `battleId` и имя группы с лексикографически наименьшим `battleId`.
- PLAYER видит название без поля редактирования.

## Command/ACK и постоянные таймауты

### Подтверждённая причина

Popover был обновлён до ACK с обязательным `recipientConnectionId`, а manifest оставался `1.0.0`. Постоянный background Owlbear мог продолжать работать на старом коде, посылать legacy ACK, который новый popover молча отбрасывал до общего пятисекундного таймаута.

### Протокол 1.2

- Command и ACK получают явное `protocolVersion: 2`.
- Manifest/application bump и query cache-busting принудительно обновляют popover и background вместе.
- На время rolling upgrade legacy ACK без `protocolVersion` и `recipientConnectionId` принимается только если:
  - requestId принадлежит текущему pending request;
  - фактический `event.connectionId` совпадает с доверенным coordinator;
  - заявленный `coordinatorConnectionId` совпадает с `event.connectionId`;
  - requestId не был уже завершён.
- Legacy ACK нормализуется локально; новый background всегда отправляет protocol v2 с recipient.
- Доверенный coordinator определяется прежде всего из текущего persisted scene lease. Live election используется только как startup fallback, а не как отдельная конкурирующая истина.
- Если coordinator нельзя определить до отправки, UI сразу получает `NO_COORDINATOR`, а не ждёт общий timeout.
- Отброшенный ACK сохраняет диагностическую причину: malformed, wrong recipient, wrong sender, protocol mismatch или stale request.
- Истинный timeout переводится как `Фоновая часть расширения не отвечает. Перезапустите расширение`, чтобы отличаться от domain rejection.

### Background lifecycle

- Command broadcast listener устанавливается независимо от route tool initialization и остаётся доступен при нефатальной ошибке очистки preview.
- Lease запускается даже если route tool cleanup не удался; ошибка инструмента уведомляется отдельно.
- Ошибка запуска background не отбрасывается без следа: она записывает диагностический status и выводится в console/diagnostics.
- Команды, полученные до готовности coordinator, не получают ответы от всех background-клиентов. Только экземпляр, который является текущим coordinator либо выбран live-election как следующий coordinator, возвращает явное `BACKGROUND_NOT_READY`; остальные молча игнорируют команду.

## Иконка

Создаётся `public/icon-1.2.png`:

- квадратный прозрачный PNG;
- крупный вертикальный пиксельный силуэт меча по приложенному референсу;
- бело-серая высокая контрастность;
- толстая читаемая форма для размера панели Owlbear;
- без `RP`, других букв, рамки, фона, тени и водяных знаков.

Иконка используется в manifest, action button, route tool, route mode и шапке popover. Исходный SVG больше не является production reference, но может оставаться в истории Git.

## Ошибки и обратная связь

Все новые ошибки имеют русские сообщения:

- `NO_COORDINATOR` — координатор ещё не готов;
- `BACKGROUND_NOT_READY` — background загрузился, но scene command handler не готов;
- `PROTOCOL_MISMATCH` — несовместимые версии popover/background;
- `BATTLE_NOT_FOUND` — бой уже завершён или удалён;
- `INVALID_BATTLE_NAME` — пустое или слишком длинное имя.

Domain rejection, revision conflict и barrier error остаются отдельными от transport failures.

## Тестирование

Реализация ведётся red-green TDD. Обязательные автоматические проверки:

1. Role-safe snapshot: GM/all, member/own sides, multi-side union, outsider/none, detected enemy/map-only.
2. GM-only registration: UI и crafted PLAYER command.
3. Grid center: square/hex-port contract, registration centering, legacy-army centering on successful route, cancellation without movement.
4. Clamp: exact maximum, pointer beyond maximum, multi-waypoint remaining distance, no duplicate cell, barrier before/after clamp.
5. Authoritative rejection неснапнутых crafted coordinates и повторная нормализация безопасных координат.
6. Route preview/persistent route/barrier reconcile: stable IDs, update-in-place, zero writes for identical input, add-before-delete.
7. RefreshCoordinator: coalescing, latest lifecycle generation, stale completion rejection, unchanged snapshot without publish.
8. Battle migration/name creation/rename/reinforcement/merge, GM authorization и PLAYER read-only UI.
9. Реальный in-memory command path через gateway, broadcast hub, runtime, lease и ProductionEngine.
10. Mixed-version legacy ACK, protocol v2 ACK, wrong coordinator, wrong recipient, no coordinator и explicit startup failure.
11. Manifest/package version equality, versioned URLs, PNG existence, dimensions и alpha channel.
12. Полный `npm run check`, `git diff --check`, credential scan и независимый code/security review.

## Доставка

После зелёных проверок:

1. feature branch fast-forward сливается в `main`;
2. `main` повторно проходит полный gate;
3. `main` отправляется в `minigooser-arch/owlbear-mharmies`;
4. ожидается успешный GitHub Pages workflow;
5. по HTTPS проверяются manifest, popover, background, PNG и hashed assets;
6. пользователю передаётся прежний постоянный manifest URL:

`https://minigooser-arch.github.io/owlbear-mharmies/manifest.json`

Live-room проверки явно отделяются от автоматических и не помечаются PASS без фактического запуска в Owlbear.

## Вне объёма 1.2

- Изменение существующей map detection/fog модели.
- Право лидеров запускать, останавливать или переименовывать бои.
- Серверный backend или криптографическая секретность Owlbear metadata.
- Произвольное ручное перемещение армий игроками.
- Полная замена custom multi-waypoint route tool на нативный одноотрезочный Ruler.
