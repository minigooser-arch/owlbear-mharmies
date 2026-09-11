# Strategic State War System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved state-owned strategic map and war rules: directional passage, pairwise wars, delayed border-war escalation, forced withdrawal, occupation, supply/encirclement, strategic cities and territorial score, manual peace transfers, rebellions/civil wars, and an idempotent global-turn lifecycle.

**Architecture:** Keep terrain, recognized ownership, and de-facto control as independent map layers. Centralize interstate authorization in exact state-pair relations, run strategic movement step-by-step so collision and occupation observe only actually reached cells, and run turn-boundary effects through an idempotent checkpoint pipeline. Keep cities, rebellion snapshots, scores, violations, and forced exits as explicit persisted domain state rather than deriving historical facts from UI.

**Tech Stack:** TypeScript, React, Vitest, Owlbear Rodeo SDK, scene/item metadata persistence, Vite.

**Spec:** `docs/superpowers/specs/2026-09-11-state-territory-access-design.md`

## Global Constraints

- Strict RED→GREEN TDD for every behavior-changing task.
- Terrain, `recognizedStateId`, and `deFactoStateId` are independent.
- `Side.stateId` is the sole faction→state membership source.
- Active states have exactly one valid ruling faction.
- Military access is directional; war is symmetric and pairwise.
- Generic “participates in any war” must never authorize movement.
- Non-ruling factions may enter foreign land only through passage or an existing war and never create a new war by movement.
- Ruling factions may enter closed foreign territory, but that creates a persisted violation, not an immediate war.
- Automatic war is evaluated at the next global-turn checkpoint and is cancelled if access/war is restored or the army leaves first.
- Only ruling-faction armies change `deFactoStateId` during an active war.
- Occupation applies only to cells actually reached before a collision stops movement.
- Passage never carries supply.
- Encirclement does not prohibit movement/attack but prohibits healing and removes 10% max HP at the turn checkpoint.
- Existing army collision/BattleGroup semantics remain intact.
- Existing ship occupied-cell and naval-battle behavior remain intact; no automatic global fleet-collision→naval-battle feature is added.
- No LR, claims, military administration, loyalty/♥️, mayor gameplay, score purchase, passage request/cost, territorial waters, or coalition-war system in this implementation.
- Every checkpoint effect must be idempotent by global turn number/id.
- Every task ends with focused tests and a commit.

---

### Task 1: Schema and persistence

**Files:** `src/shared/types.ts`, `src/shared/validation.ts`, `src/storage/migrations.ts`, `src/storage/metadataRepository.ts` and their tests.

**Produces:** `StateRelations`, `ForeignPresenceViolation`, `ForcedExitState`, `StrategicCity`, `TerritorialScore`, `RebellionState`, `TurnCheckpointState` in the latest scene.

- [ ] Write failing migration/validation tests proving old scenes preserve armies, ships, terrain, states, recognized/deFacto ownership and wars; new collections default empty; legacy `factionTerritoryIds` remains readable; future schema is rejected.
- [ ] Run `npx vitest run src/storage/migrations.test.ts src/shared/validation.test.ts src/storage/metadataRepository.test.ts` and confirm RED.
- [ ] Add exact persisted types:
```ts
interface ForeignPresenceViolation { armyId:string; homeStateId:string; hostStateId:string; enteredOnTurn:number; checkOnTurn:number; }
interface ForcedExitState { armyId:string; startedOnTurn:number; originReason:"PASSAGE_REVOKED"|"WAR_ENDED"|"BORDER_CHANGED"|"OTHER"; }
interface StrategicCity { id:string; name:string; cells:GridCellCoord[]; recognizedStateId:string; deFactoStateId:string; factionInfluenceId:string|null; mayorId:string|null; isCapital:boolean; historicalBuildTypeCount:number; }
interface TerritorialScore { holderStateId:string; opponentStateId:string; points:number; }
interface RebellionState { id:string; sourceStateId:string; startedOnTurn:number; recognizedTerritorySnapshot:GridCellCoord[]; capitalCityId:string; participantFactionIds:string[]; active:boolean; }
interface TurnCheckpointState { turnNumber:number; illegalPresenceDone:boolean; forcedExitDone:boolean; supplyDone:boolean; encirclementDone:boolean; territorialScoreDone:boolean; }
```
- [ ] Bump schema/protocol consistently; normalize all new collections; migrate only unambiguous two-state wars into pairwise relations; never infer state territory from faction territory.
- [ ] Run focused tests plus `npm run typecheck`; confirm GREEN.
- [ ] Commit `feat: persist strategic state war domain`.

### Task 2: State invariants and pairwise diplomacy

**Files:** create `src/states/stateService.ts`, `src/states/stateRelations.ts` and tests; modify `stateRules.ts`, `wars/warRules.ts`, annexation, command validation/processor and permissions.

**Interfaces:**
```ts
hasMilitaryAccess(relations, fromStateId, toStateId): boolean
areStatesAtWar(relations, leftStateId, rightStateId): boolean
setMilitaryAccess(relations, fromStateId, toStateId, allowed): StateRelations
setPairWar(relations, leftStateId, rightStateId, atWar): StateRelations
```
- [ ] RED tests: active state has exactly one ruler belonging to it; A→B ≠ B→A; A↔B war symmetric; A↔B grants nothing against C; legacy multi-state war grants no blanket access.
- [ ] Run RED: `npx vitest run src/states src/annexation/annexationRules.test.ts`.
- [ ] Implement pure state/relation services; `setPairWar` writes both directions; passage writes one.
- [ ] Add GM-only `SET_STATE_MILITARY_ACCESS` and `SET_STATE_WAR`; no passage-request/cost flow.
- [ ] Replace generic war authorization in annexation/runtime consumers.
- [ ] Run GREEN/typecheck and commit `feat: enforce pairwise state diplomacy`.

### Task 3: Independent political map layers

**Files:** `src/terrain/gridMap.ts`, `src/owlbear/mapBrushTool.ts`, `src/background/mapBrushToolService.ts`, `src/terrain/mapOverlayService.ts`, `src/ui/pages/MapEditorPage.tsx` and tests.

- [ ] RED tests: recognized painting preserves terrain/deFacto; terrain preserves political fields; deFacto preserves recognized; current UI has no faction-territory brush.
- [ ] Run focused RED tests.
- [ ] Use field-specific cell patches with modes `TERRAIN | IMPASSABLE | RECOGNIZED_STATE | DEFACTO_STATE | ERASER`.
- [ ] Render recognized borders and de-facto front separately over terrain.
- [ ] Run GREEN/typecheck and commit `feat: separate state ownership and control layers`.

### Task 4: Strategic cities

**Files:** create `src/cities/strategicCities.ts` + tests; modify shared types, commands, `MapEditorPage`.

**Interfaces:**
```ts
validateStrategicCity(city, gridMap, states): CityValidationResult
resolveCityDeFactoState(city, gridMap): string | null
```
- [ ] RED tests: unique/nonempty cells, valid state references, nonnegative integer `historicalBuildTypeCount`, full-city control required; mixed control returns null.
- [ ] Run RED.
- [ ] Implement GM CRUD. `historicalBuildTypeCount` is manual; no Towny `/t builds`, administration or loyalty integration.
- [ ] Add minimal city editor: cells, capital flag, build-type count.
- [ ] Run GREEN/typecheck and commit `feat: add strategic city objects`.

### Task 5: State movement and delayed foreign-presence violations

**Files:** create `src/movement/stateMovementAccess.ts`, `src/wars/foreignPresence.ts` + tests; modify movement rules/engine and route planning.

**Interfaces:**
```ts
type StateAccessDecision = "ALLOW_OWN"|"ALLOW_PASSAGE"|"ALLOW_WAR"|"ALLOW_RULER_VIOLATION"|"DENY_FOREIGN"|"DENY_STATELESS";
classifyStateAccess(input): StateAccessDecision
recordForeignPresenceViolation(scene, armyId, hostStateId, currentTurn): SceneState
reconcileForeignPresenceViolations(scene): SceneState
```
- [ ] RED: non-ruler own/pass/war allowed, closed foreign denied; ruler closed foreign enters with violation but no immediate war; null recognized state creates no violation.
- [ ] RED: turn N entry sets `checkOnTurn=N+1`; passage/manual war/leaving before checkpoint clears violation; no duplicates.
- [ ] Run RED.
- [ ] Implement classifier and route warnings without diplomacy mutation; remove runtime faction-territory/generic-war access.
- [ ] Run GREEN/typecheck and commit `feat: add delayed foreign presence violations`.

### Task 6: Forced withdrawal and nearest-valid-territory search

**Files:** create `src/movement/forcedExitPathfinder.ts`, `forcedExitService.ts` + tests; modify route planning/rules and `ArmiesPage`.

**Interfaces:**
```ts
findShortestForcedExitRoutes(input): GridCellCoord[][]
requiresForcedExit(scene, armyId): boolean
validateForcedExitRoute(scene, armyId, route): {ok:true}|{ok:false;reason:"NOT_SHORTEST_EXIT"|"NO_EXIT_ROUTE"}
```
- [ ] RED: nearest legal territory, obstacles, equal shortest routes, multi-turn exit, enemy collision on a legal war path.
- [ ] RED: revoked passage/ended war/border change activates next-turn forced exit; restored legality clears it; non-shortest route rejected.
- [ ] Implement orthogonal BFS and enforce spending available movement along a shortest exit route; battle still stops movement.
- [ ] Show forced-exit status/options in army UI.
- [ ] Run GREEN/typecheck and commit `feat: enforce forced strategic withdrawal`.

### Task 7: Stepwise movement and wartime occupation

**Files:** create `src/occupation/occupationService.ts` + tests; modify movement engine/progress and battle regressions.

**Interface:** `applyOccupationForReachedCell(scene, armyId, cell): SceneState`.

- [ ] RED: ruling army captures every actually reached recognized-enemy cell only during exact-pair war; non-ruler/pass/peacetime violation captures none; recognized owner never changes; recapture works repeatedly.
- [ ] RED: collision at C after A/B means D/E never occupied and remaining movement is lost.
- [ ] Integrate occupation after each successful authoritative step, never by bulk planned route.
- [ ] Run GREEN/typecheck and commit `feat: apply stepwise wartime occupation`.

### Task 8: Supply pathfinding and visualization

**Files:** create `src/supply/supplyPathfinder.ts`, `supplyService.ts`, `src/owlbear/supplyOverlayService.ts` + tests; modify `ArmiesPage` and healing authorization.

**Interfaces:**
```ts
findSupplyPath(scene, armyId): GridCellCoord[] | null
isArmySupplied(scene, armyId): boolean
```
- [ ] RED: contiguous actual own control supplies; enemy occupation cuts; connected own occupation can extend; passage never supplies; diagonal contact never supplies.
- [ ] Implement deterministic orthogonal BFS with stable neighbor order.
- [ ] Add local-only `Показать снабжение` overlay; switching/toggling removes/replaces it; no scene mutation.
- [ ] Run GREEN/typecheck and commit `feat: add strategic supply paths`.

### Task 9: Encirclement

**Files:** create `src/supply/encirclementService.ts` + tests; modify health/healing and army UI.

**Interface:** `applyEncirclementCheckpoint(scene, turnNumber): SceneState`.

- [ ] RED: unsupplied becomes encircled; damage `max(1, ceil(maxHp*0.10))` once per turn checkpoint; retry cannot double-hit; zero HP uses existing destruction; movement/attack remain allowed; healing denied.
- [ ] Implement using existing health/destruction primitives.
- [ ] Show supply/encirclement status.
- [ ] Run GREEN/typecheck and commit `feat: apply encirclement effects`.

### Task 10: Territorial war score

**Files:** create `src/wars/territorialScore.ts` + tests; modify cities/types/`BattlesPage`.

**Interfaces:**
```ts
applyTerritorialScoreCheckpoint(scene, turnNumber): SceneState
cityIncome(city): number // 1 + historicalBuildTypeCount
```
- [ ] RED: fully held enemy city accrues formula; mixed city zero; A→B/A→C independent; lost city stops future income but preserves accumulated score; peace preserves accumulated score; retry is idempotent.
- [ ] Implement exact-pair active-war accrual only.
- [ ] Show accumulated score and currently contributing cities; no score-purchase UI.
- [ ] Run GREEN/typecheck and commit `feat: accrue territorial war score`.

### Task 11: GM peace territory transfer

**Files:** create `src/territory/peaceTransfer.ts` + tests; modify commands, map brush and editor.

**Interfaces:**
```ts
validatePeaceTransfer(scene, recipientStateId, cells): PeaceTransferResult
applyPeaceTransfer(scene, recipientStateId, cells): SceneState
```
- [ ] RED: arbitrary selected cells transfer; unselected unchanged; transfer need not match occupation; deFacto normalizes to recipient; partial multi-cell city rejected; no LR/claims side effects.
- [ ] Implement local preview + explicit GM confirm; only confirmation mutates recognized ownership.
- [ ] Add transfer overlay.
- [ ] Run GREEN/typecheck and commit `feat: add manual peace territory transfers`.

### Task 12: Rebellion snapshots, capital control and force accounting

**Files:** create `src/rebellions/rebellionService.ts` + tests; modify types/commands and compact GM status UI.

**Interfaces:**
```ts
startRebellion(scene,input): SceneState
getRebellionCapitalController(scene,id): string|null
getRebellionFactionStrength(scene,id,factionId): {armyCount:number;currentHp:number;maxHp:number}
```
- [ ] RED: territory/capital snapshot immutable; one participant alone in capital controls; multiple internal sides means null; strength ignores armies outside snapshot/nonparticipants.
- [ ] Implement snapshot/control/aggregates without inventing a winner formula.
- [ ] Add GM start/close and status display.
- [ ] Run GREEN/typecheck and commit `feat: add strategic rebellion state`.

### Task 13: Atomic civil-war split

**Files:** create `src/rebellions/civilWarService.ts` + tests; modify states/relations/cities/commands.

**Interface:**
```ts
startCivilWar(scene,{sourceStateId,rebelFactionId,newStateId,newStateName,newStateColor}): CivilWarResult
```
- [ ] RED: new state; rebel faction becomes ruler; only complete city cell sets under its `factionInfluenceId` transfer; ordinary cells stay successor; armies/positions/HP/routes unchanged; new state and successor immediately have exact-pair war; validation failure rolls back all.
- [ ] Implement one pure atomic scene mutation reusing state/relation helpers.
- [ ] Add GM-confirmed command/UI action.
- [ ] Run GREEN/typecheck and commit `feat: add civil war state split`.

### Task 14: Idempotent global-turn checkpoint and completion guard

**Files:** create `src/turns/turnCheckpointPipeline.ts`, `turnCompletionGuard.ts` + tests; modify `turnService.ts` and commands.

**Interfaces:**
```ts
type TurnBlocker = "LAND_BATTLE_ACTIVE"|"NAVAL_BATTLE_ACTIVE"|"MOVEMENT_RESOLUTION_PENDING"|"FORCED_EXIT_PENDING"|"ILLEGAL_PRESENCE_CHECK_PENDING"|"SUPPLY_CHECK_PENDING"|"ENCIRCLEMENT_PENDING"|"TERRITORIAL_SCORE_PENDING";
getTurnCompletionBlockers(scene): TurnBlocker[]
runTurnCheckpoint(scene,nextTurnNumber): SceneState
```
- [ ] RED each blocker independently, including existing naval battle guard.
- [ ] RED pipeline: overdue illegal presence creates one war; restored access cancels; forced exit activates; supply→encirclement→score happen once; retry after partial failure cannot duplicate HP loss/score.
- [ ] Implement fixed order: close movement → illegal presence → forced exit → supply → encirclement → territorial score → open movement.
- [ ] Integrate turn commands; expose reason list rather than opaque boolean.
- [ ] Run GREEN/typecheck and commit `feat: orchestrate strategic war turn checkpoints`.

### Task 15: States/diplomacy/status UI

**Files:** create `src/ui/pages/StatesPage.tsx` + tests; modify App/state hook, Armies/Battles/MapEditor pages and existing CSS only as needed.

- [ ] RED UI: GM CRUD states/ruler; A→B and B→A passage separately; exact-pair war start/end; violation deadline; forced exit; supply/encirclement; city scores; rebellion; peace transfer. Non-GM cannot mutate admin diplomacy. No faction-territory editor.
- [ ] Implement with existing Wiki-light visual patterns and authoritative command dispatch only.
- [ ] Run `npx vitest run src/ui` + typecheck and commit `feat: add state war administration UI`.

### Task 16: Full audit and regression verification

**Files:** modify remaining obsolete runtime consumers; add `src/movement/stateWarIntegration.regression.test.ts` and `src/storage/strategicWarPersistence.regression.test.ts`.

- [ ] Search runtime for `factionTerritoryIds`, `OUTSIDE_FACTION_TERRITORY`, `isFactionAtWar`, and direct `WarState.participantStateIds` authorization. Only migration/legacy parsing fixtures may remain.
- [ ] Add integration RED scenarios: delayed auto-war/cancellation; non-ruler denial; war access; stepwise occupation/recapture; supply cut→encirclement; forced exit after peace; city score; manual peace transfer; civil-war split; checkpoint retry.
- [ ] Run focused integration tests and fix integration-only defects.
- [ ] Run fresh full verification:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```
All must exit 0 before completion is claimed.
- [ ] Commit `test: verify strategic state war integration`.

## Review gates

1. Tasks 1–3 — schema, diplomacy, political map.
2. Tasks 4–7 — cities, access, forced exit, occupation.
3. Tasks 8–10 — supply, encirclement, territorial score.
4. Tasks 11–13 — peace, rebellion, civil war.
5. Tasks 14–16 — turn lifecycle, UI, full audit.

At every gate run focused suites plus `npm run typecheck`. At the final gate run the full verification above and `npm run check` as an additional aggregate check if it still exists.
