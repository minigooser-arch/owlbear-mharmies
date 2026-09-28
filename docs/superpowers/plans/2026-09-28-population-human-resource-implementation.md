# Population and Human Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Реализация выполняется нативно, без суб-агентов.

**Goal:** Добавить во внутреннее состояние сцены редактируемую модель населения, мобилизационного потенциала и ЛР государства, списывать ЛР при платных военных операциях и выдавать мастеру готовый журнал для ручного переноса в Google Sheets.

**Architecture:** Демографические записи живут в `SceneState` и индексируются стабильным `stateId`. Чистый календарный сервис отдельно рассчитывает рост населения и ограничение ЛР, а слой команд атомарно проверяет и списывает ЛР перед изменением армии. Производственный фон применяет календарный расчёт до обработки команд и при открытии сцены, поэтому пропущенные дни догоняются идемпотентно; UI мастера редактирует записи и показывает журнал операций.

**Tech Stack:** TypeScript, React, Vitest, существующие миграции/нормализаторы `SceneState`, command processor, OBR background runtime.

**Spec:** `docs/superpowers/specs/2026-09-28-population-and-human-resources-design.md`

## Global Constraints

- Население и ЛР принадлежат государству; фракция расходует ЛР только государства из своего `stateId`.
- Фракция без государства не может создавать платную операцию за ЛР.
- ЛР не восстанавливается автоматически и не возвращается при роспуске или уничтожении армии.
- Рост населения идёт по реальной календарной дате сцены; один календарный день применяется не более одного раза.
- Коэффициент `1.003` означает ежедневное умножение населения на `1.003`, без округления внутреннего значения.
- Закон о призыве меняет максимум `population × conscriptionRate`; повышение максимума не начисляет текущий ЛР, снижение ограничивает текущий ЛР.
- Google Sheets не вызывается из расширения; записи только сохраняются во внутреннем журнале для ручного переноса мастером.
- Создание армии и комплектация списывают ЛР до изменения армии и создают `PENDING`-строку журнала; базовое лечение армии остаётся бесплатным (`+10 HP` после хода), если отдельное правило не задаёт платную операцию.
- Все административные исправления ЛР/населения имеют причину и отдельный журнал, не маскируясь под военный расход.
- Старые сцены без демографических данных должны продолжать загружаться без потери армий, городов и существующих `lrTransactions`.
- Новая версия сцены — `9`; `SceneSettings.populationTimeZone` по умолчанию равен `Europe/Moscow` и нормализуется как IANA time-zone string с безопасным fallback.

## Review Focus

- Пропуск нескольких календарных дней и повторное открытие в тот же день: тесты календарного сервиса и фонового входа должны доказывать отсутствие двойного начисления.
- Дробный коэффициент роста и потеря точности от UI-округления: тесты проверяют внутреннее значение, а не только форматированный текст.
- Две фракции одного государства и фракция без `stateId`: тесты команд проверяют общий баланс государства и отклонение операции без мутации армии.
- Снижение закона о призыве при текущем ЛР выше нового максимума: тест фиксирует обрезание ровно до нового потенциала, а повышение закона — отсутствие бесплатного начисления.
- Старая сцена, старые транзакции и ручная коррекция: тесты миграции и журнала проверяют сохранение данных и различимость административной записи.

---

### Task 1: Модель демографии, справочник законов и миграция

**Files:**
- Modify: `src/shared/types.ts` — добавить `StateDemography`, `ConscriptionLaw`, `DemographyAuditEntry`, коллекции `demographics`/`conscriptionLaws`/`demographyAudit` в `SceneState`/`StrategicSceneState`, поле `populationTimeZone` в `SceneSettings`, поля `stateId`/балансы в `LRTransaction`.
- Modify: `src/shared/constants.ts` — добавить справочник законов по умолчанию, значения демографических дат и часового пояса без изменения существующих военных стоек.
- Modify: `src/shared/validation.ts` — нормализация демографических записей, законов и расширенного журнала с безопасными значениями для старых сцен.
- Modify: `src/storage/migrations.ts` — миграция текущей версии сцены к новой версии с пустыми `demographics`, дефолтными законами и сохранением `lrTransactions`.
- Modify: `src/owlbear/snapshotEquality.ts` — сравнивать новые коллекции по стабильным идентификаторам.
- Test: `src/shared/validation.test.ts`, `src/storage/migrations.test.ts`.

**Interfaces:**
- Produces `StateDemography = { stateId: string; population: number; populationGrowthFactor: number; humanResource: number; conscriptionLawId: string; conscriptionRate: number; humanResourceCapacity: number; lastPopulationCalculationDate: string | null }`.
- Produces `ConscriptionLaw = { id: string; name: string; rate: number; active: boolean }`.
- Produces `DemographyAuditEntry = { id: string; stateId: string; actorPlayerId: string; reason: string; changes: Record<string, { before: number | string; after: number | string }>; createdAt: string }`.
- Extends `LRTransaction` with `stateId`, `stateName`, `factionId`, `factionName`, `balanceBefore`, `balanceAfter` while accepting legacy entries without them.

- [ ] **Step 1: Write failing normalization and migration tests.** Проверить старую сцену без новых полей, сохранение существующих транзакций, удаление отрицательных/нечисловых значений, дефолтные ставки `0 / .02 / .04 / .08 / .18 / .24`.
- [ ] **Step 2: Run focused tests and verify they fail for missing types/normalizers.**

Run: `npm.cmd test -- --run src/shared/validation.test.ts src/storage/migrations.test.ts`

Expected: FAIL с отсутствующими полями/нормализацией.

- [ ] **Step 3: Implement the new types, defaults, normalizers, migration, and snapshot equality.** Версию сцены увеличить ровно на один шаг; legacy `lrTransactions` не перезаписывать пустым массивом при миграции.
- [ ] **Step 4: Run focused tests and verify they pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/shared/types.ts src/shared/constants.ts src/shared/validation.ts src/storage/migrations.ts src/owlbear/snapshotEquality.ts src/shared/validation.test.ts src/storage/migrations.test.ts
git commit -m "feat: add demographic state model and migration"
```

### Task 2: Идемпотентный календарный расчёт населения

**Files:**
- Create: `src/population/populationRules.ts` — чистые функции календарного применения и пересчёта потенциала.
- Create: `src/population/populationRules.test.ts`.

**Interfaces:**
- `export interface PopulationCalendarOptions { today: string; timeZone: string }`.
- `export function applyPopulationCalendar(record: StateDemography, laws: readonly ConscriptionLaw[], options: PopulationCalendarOptions): StateDemography`.
- `export function recalculateHumanResourceCapacity(record: StateDemography, laws: readonly ConscriptionLaw[]): StateDemography`.
- `export function populationDateInTimeZone(now: Date, timeZone: string): string` возвращает `YYYY-MM-DD`.

- [ ] **Step 1: Write failing rule tests.** Зафиксировать один день при `population=1000`, `factor=1.003`; догон нескольких дней; повтор той же даты без изменения; смену закона; ограничение ЛР при падении потенциала; отсутствие начисления ЛР при росте потенциала; некорректный коэффициент как no-op.
- [ ] **Step 2: Run `npm.cmd test -- --run src/population/populationRules.test.ts` and verify failure.**
- [ ] **Step 3: Implement the pure functions.** Использовать календарную разницу по датам, последовательное умножение/эквивалентную степень без округления; не использовать номер глобального хода и не менять `humanResource` при увеличении capacity. Для новой записи с `lastPopulationCalculationDate: null` зафиксировать текущую дату без ретроактивного роста.
- [ ] **Step 4: Run focused tests and verify pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/population/populationRules.ts src/population/populationRules.test.ts
git commit -m "feat: calculate calendar population growth idempotently"
```

### Task 3: Атомарное списание ЛР и административные корректировки

**Files:**
- Create: `src/finance/humanResourceLedger.ts` — разрешение государства, проверка баланса, списание и записи ручных корректировок.
- Create: `src/finance/humanResourceLedger.test.ts`.
- Modify: `src/finance/lrLedger.ts` — поддержать новые поля транзакций и дедупликацию по `requestId`.
- Modify: `src/shared/types.ts` — добавить тип административной записи и отдельный статус/вид операции, не смешивающий её с военным расходом.

**Interfaces:**
- `export type HumanResourceDebitResult = { ok: true; demography: StateDemography; transaction: LRTransaction } | { ok: false; reason: "STATE_REQUIRED" | "STATE_NOT_FOUND" | "INSUFFICIENT_HUMAN_RESOURCE" | "INVALID_AMOUNT" }`.
- `export function debitHumanResource(scene: SceneState, sideId: string, amount: number, context: { requestId: string; actorPlayerId: string; kind: LRTransactionKind; armyId: string; armyName: string; cityId: string | null; cityName: string | null; hp: number; ratePerHp: number; turnNumber: number; createdAt: string }): HumanResourceDebitResult`.
- `export function applyDemographyCorrection(record: StateDemography, patch: Partial<Pick<StateDemography, "population" | "populationGrowthFactor" | "humanResource" | "conscriptionLawId" | "conscriptionRate">>, reason: string, actorPlayerId: string, at: string): { record: StateDemography; entry: DemographyAuditEntry }`.

- [ ] **Step 1: Write failing ledger tests.** Проверить общий баланс для двух фракций одного государства, отклонение stateless/unknown faction, отклонение при недостатке без изменения записи, создание `balanceBefore/balanceAfter`, повтор запроса без двойного списания.
- [ ] **Step 2: Run focused tests and verify failure.**
- [ ] **Step 3: Implement debit and correction helpers.** Списание и добавление транзакции должны быть атомарным чистым преобразованием; значение `humanResource` не может стать отрицательным.
- [ ] **Step 4: Run focused tests and verify pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/finance/humanResourceLedger.ts src/finance/humanResourceLedger.test.ts src/finance/lrLedger.ts src/shared/types.ts
git commit -m "feat: debit state human resource atomically"
```

### Task 4: Подключение календаря и ЛР к командам и глобальному ходу

**Files:**
- Modify: `src/commands/commandProcessorCore.ts` — перед `CREATE_CITY_ARMY` и `FORM_ARMY` применить дебит ЛР, отклонять команду до создания/изменения армии; добавить административные команды мастера.
- Modify: `src/commands/commandValidationCore.ts` — валидировать новые команды и причину ручной корректировки.
- Modify: `src/shared/permissions.ts` — разрешить демографические команды только GM; сохранить текущие права лидеров на свои города/армии.
- Modify: `src/turns/turnService.ts` — сохранить бесплатное базовое лечение `+10 HP` после хода; не списывать из ЛР и не создавать фиктивную расходную транзакцию.
- Modify: `src/background/applicationCore.ts` — добавить `ensurePopulationCalendarApplied` до обработки команды/снимка и на `turnTick`, выполняя мутацию только координатором/GM.
- Modify: `src/background/application.test.ts`, `src/commands/commandProcessor.test.ts`, `src/commands/commandValidation.test.ts`.

**Interfaces:**
- `CommandProcessor` получает нормализованные `scene.demographics`/`scene.conscriptionLaws` и использует `debitHumanResource`.
- `ensurePopulationCalendarApplied(scene: SceneState, now: Date): SceneState` применяет дату в часовом поясе настроек и возвращает сцену без изменения при уже применённой дате.
- Новые payload-типы: `UPDATE_STATE_DEMOGRAPHY` с `stateId`, patch и `reason`; `UPSERT_CONSCRIPTION_LAW` с `lawId`, названием/ставкой/active и `reason`. Оба payload допускаются только GM и добавляют `DemographyAuditEntry` при изменении данных.

- [ ] **Step 1: Write failing command/background tests.** Проверить: создание армии на 5 HP списывает `5 × armyFormationCostPerHp`; комплектация списывает только запрошенный HP; недостаток ЛР не создаёт токен/армию и не меняет HP; два side одного state делят баланс; календарь применяется при первом command после пропуска дней и повторно не начисляется; GM-only correction требует непустую причину.
- [ ] **Step 2: Run focused tests and verify failure.**
- [ ] **Step 3: Implement command and background integration.** Ветви команд должны сначала получить демографическую запись, затем выполнить существующую проверку города/армии, затем дебит и только после успешного дебита менять армию; результат дебита заменяет запись в `scene.demographics` и добавляет транзакцию в `scene.lrTransactions`; ошибка возвращается как понятное `INSUFFICIENT_HUMAN_RESOURCE`/`STATE_REQUIRED`.
- [ ] **Step 4: Run focused tests and verify pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/commands/commandProcessorCore.ts src/commands/commandValidationCore.ts src/shared/permissions.ts src/turns/turnService.ts src/background/applicationCore.ts src/background/application.test.ts src/commands/commandProcessor.test.ts src/commands/commandValidation.test.ts
git commit -m "feat: enforce human resource spending in army commands"
```

### Task 5: Передача демографии в UI и раздел управления мастера

**Files:**
- Create: `src/ui/pages/PopulationPage.tsx` — список государств, текущие значения, capacity, закон, коэффициент и формы коррекции.
- Create: `src/ui/pages/PopulationPage.test.tsx`.
- Modify: `src/ui/state/useExtensionState.ts` — добавить демографию, законы и журнал административных изменений в snapshot.
- Modify: `src/owlbear/extensionServicesCore.ts`, `src/owlbear/extensionServices.ts` — передавать GM демографические данные; игрокам не раскрывать административные поля.
- Modify: `src/ui/App.tsx`, `src/ui/pages/ManagementPage.tsx` — добавить раздел `НАСЕЛЕНИЕ_И_ЛР` и команды формы.
- Modify: `src/ui/pages/SettingsPage.tsx` — оставить существующие ставки военных расходов и добавить только необходимые настройки часового пояса/периода, без скрытого LR auto-recovery.

**Interfaces:**
- `PopulationPage` принимает `states`, `demographics`, `conscriptionLaws`, `onAction`, `playerId` и отображает округлённые значения, сохраняя точные значения только в payload.
- Доступ к странице и отправка команд ограничены `isGM`; лидер видит только игровые операции, не административную таблицу.

- [ ] **Step 1: Write failing component/state tests.** Проверить рендер карточки государства, отображение capacity и закона, disabled-submit при пустой причине, формирование payload коррекции и отсутствие демографии в player snapshot.
- [ ] **Step 2: Run focused UI tests and verify failure.**
- [ ] **Step 3: Implement snapshot plumbing and page.** Использовать существующие компоненты/стили управления; не вводить сетевые вызовы Google Sheets.
- [ ] **Step 4: Run focused tests and verify pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/ui/pages/PopulationPage.tsx src/ui/pages/PopulationPage.test.tsx src/ui/state/useExtensionState.ts src/owlbear/extensionServicesCore.ts src/owlbear/extensionServices.ts src/ui/App.tsx src/ui/pages/ManagementPage.tsx src/ui/pages/SettingsPage.tsx
git commit -m "feat: add GM population and human resource management UI"
```

### Task 6: Журнал ЛР с готовым переносом в Google Sheets

**Files:**
- Modify: `src/ui/pages/LRLedgerPage.tsx` — фильтры по государству/фракции/типу, balance before/after, готовая TSV-строка и отметка `RECORDED`.
- Modify: `src/ui/pages/ManagementPage.tsx`, `src/ui/App.tsx` — передать новые поля и фильтры.
- Modify: `src/finance/lrLedger.test.ts`, create `src/ui/pages/LRLedgerPage.test.tsx`.
- Modify: `src/shared/validation.ts` — сохранить legacy transaction display и новые поля.

**Interfaces:**
- `formatLRTransactionForSheet(transaction: LRTransaction): string` возвращает одну таб-разделённую строку без сетевых эффектов.
- Фильтр не меняет данные сцены; подтверждение вызывает существующий `MARK_LR_TRANSACTION_RECORDED`.

- [ ] **Step 1: Write failing formatting/UI tests.** Проверить порядок колонок `stateId/stateName/factionId/factionName/armyId/operationKind/hp/amount/balanceBefore/balanceAfter/turnNumber/createdAt/status`, фильтры и кнопку подтверждения.
- [ ] **Step 2: Run focused tests and verify failure.**
- [ ] **Step 3: Implement formatting and UI.** Для legacy rows выводить пустые необязательные поля, не теряя старую информацию.
- [ ] **Step 4: Run focused tests and verify pass.**
- [ ] **Step 5: Commit.**

```bash
git add src/ui/pages/LRLedgerPage.tsx src/ui/pages/LRLedgerPage.test.tsx src/ui/pages/ManagementPage.tsx src/ui/App.tsx src/shared/validation.ts src/finance/lrLedger.test.ts
git commit -m "feat: prepare LR transactions for manual sheet entry"
```

### Task 7: Полная проверка, регрессии и пользовательская документация

**Files:**
- Modify: `src/commands/commandProcessor.test.ts`, `src/background/application.test.ts`, `src/ui/state/useExtensionState.test.tsx` — добавить регрессионные сценарии вокруг существующих армий/городов.
- Create or modify: `docs/player-guide/global-map.md` — описать игрокам, что ЛР принадлежит государству, как работает создание/комплектация/лечение и что Google Sheets обновляет мастер вручную.
- No new runtime dependencies; all calendar and validation behavior stays inside the extension.

- [ ] **Step 1: Run the full test suite.**

Run: `npm.cmd test`

Expected: all existing and new tests pass.

- [ ] **Step 2: Run typecheck/build.**

Run: `npm.cmd run build`

Expected: production build completes without TypeScript/Vite errors.

- [ ] **Step 3: Review generated snapshot compatibility and manually inspect the GM UI.** Проверить старую сцену, новую сцену, player snapshot и повторное открытие в тот же день.
- [ ] **Step 4: Commit documentation and final verification.**

```bash
git add docs/player-guide/global-map.md src/commands/commandProcessor.test.ts src/background/application.test.ts src/ui/state/useExtensionState.test.tsx
git commit -m "docs: explain population and human resource rules"
```
