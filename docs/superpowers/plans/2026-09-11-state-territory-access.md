# State Territory and Interstate Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace faction-owned territory with state-owned political geography, directional military access, pairwise interstate war, ruling-faction invasion, and a map/UI model where state borders coexist with terrain.

**Architecture:** Keep terrain, recognized state ownership, and de-facto control as separate cell properties. `Side.stateId` remains the source of faction→state membership. Introduce explicit state-to-state relations for directional military access and pairwise war, then make one pure state movement classifier authoritative for planning and execution. Route planning may warn about a future declaration of war but must never mutate diplomacy; actual movement by the ruling faction creates war atomically at the first closed foreign border. Legacy `factionTerritoryIds` remains readable only for migration and is removed from runtime authorization and UI.

**Tech Stack:** TypeScript, React, Vitest, Owlbear Rodeo SDK, scene/item metadata persistence, Vite.

**Spec:** `docs/superpowers/specs/2026-09-11-state-territory-access-design.md`

## Global Constraints

- Use strict TDD for every behavioral change: add the smallest failing test, run it and record RED, implement the minimum production change, run GREEN, then refactor if needed.
- Preserve existing army collision semantics: armies may enter the same cell and create/join battles.
- Preserve the existing ship occupied-cell rule: two live ships may not occupy one cell.
- State ownership must never overwrite terrain, impassability, or de-facto control unless the explicit command says so.
- Terrain edits must never overwrite recognized or de-facto state ownership.
- `recognizedStateId` is the movement-border owner in this implementation. `deFactoStateId` stays reserved for occupation/territorial-control mechanics.
- Sea movement remains outside state-border access rules.
- Do not infer state territory from legacy faction territory during migration.
- New movement access must never use “participates in any war” as authorization. It must resolve the exact moving-state/destination-state pair.
- An active state must have exactly one valid ruling faction and that faction must have `Side.stateId === state.id`.
- A non-ruling faction cannot create a war by movement. A ruling faction can create a pairwise war only when it actually enters a closed foreign state cell.
- Military access is directional; war is symmetric.
- Every task ends with focused tests and a commit before proceeding.

---

### Task 1: Introduce schema v7 and explicit state relations

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/migrations.test.ts`
- Modify: `src/shared/validation.test.ts`
- Modify: `src/tests/deploymentConfig.test.ts` only if version/protocol assertions exist there

- [ ] **Step 1: Add RED migration/validation tests for v7.**

Add fixtures proving:
- v6 scene migrates to v7;
- existing `Side.stateId`, `recognizedStateId`, `deFactoStateId`, wars, armies/naval fields survive;
- every migrated state gets a stable color fallback;
- empty interstate relations are added;
- an active state with no valid ruling faction is migrated to `active: false` rather than being assigned an invented ruler;
- legacy `factionTerritoryIds` remains deserializable;
- future version 8 is rejected;
- state relation parsing rejects unknown/missing state IDs at command time, but raw scene normalization remains loadable.

Run:
```bash
npx vitest run src/storage/migrations.test.ts src/shared/validation.test.ts
```
Expected: FAIL because v7/state relations do not exist.

- [ ] **Step 2: Extend the core types.**

In `src/shared/types.ts`, introduce:
```ts
export interface StateEntity {
  id: string;
  name: string;
  color: string;
  rulingFactionId: string | null;
  active: boolean;
}

export interface StateRelationState {
  militaryAccess: boolean;
  atWar: boolean;
}

export type StateRelations = Record<string, Record<string, StateRelationState>>;
```

Add `stateRelations: StateRelations` to the latest scene shape. Make boundary `SceneState.version` accept `5 | 6 | 7`, make the normalized latest naval scene version `7`, and bump:
```ts
export const COMMAND_PROTOCOL_VERSION = 5 as const;
```

Keep `CellState.factionTerritoryIds` temporarily as legacy-compatible data, but update its comment to state it is ignored at runtime.

- [ ] **Step 3: Add v7 normalization and migration.**

In `src/shared/validation.ts`:
- normalize state color with fallback `#607d8b`;
- normalize `stateRelations` into a clean record;
- ignore self-relations;
- normalize each relation to `{ militaryAccess, atWar }` booleans.

In `src/storage/migrations.ts` add v6→v7 migration:
```ts
function migrateV6ToV7(scene: V6Scene): V7Scene {
  const sidesById = new Map(scene.sides.map((side) => [side.id, side]));
  return {
    ...scene,
    version: 7,
    states: scene.states.map((state) => {
      const ruler = state.rulingFactionId ? sidesById.get(state.rulingFactionId) : undefined;
      const validRuler = ruler?.stateId === state.id;
      return {
        ...state,
        color: state.color ?? "#607d8b",
        active: state.active && validRuler
      };
    }),
    stateRelations: {}
  };
}
```
Do not synthesize territory or wars.

- [ ] **Step 4: Run GREEN.**

```bash
npx vitest run src/storage/migrations.test.ts src/shared/validation.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/shared/types.ts src/shared/validation.ts src/storage/migrations.ts src/storage/migrations.test.ts src/shared/validation.test.ts
git commit -m "feat: add v7 state relation schema"
```

---

### Task 2: Make state/ruling-faction invariants authoritative

**Files:**
- Create: `src/states/stateService.ts`
- Create: `src/states/stateService.test.ts`
- Modify: `src/states/stateRules.ts`
- Create: `src/states/stateRules.test.ts`
- Modify: `src/commands/commandProcessor.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandValidation.test.ts`
- Modify: `src/commands/commandProcessor.test.ts`
- Modify: `src/shared/permissions.ts`

- [ ] **Step 1: Add RED service tests for state invariants.**

Cover:
- active state requires a ruler;
- ruler must exist;
- ruler must belong to the same state;
- inactive state may temporarily have no ruler;
- moving a ruling faction to another state is rejected until the source state’s ruler is changed/deactivated;
- deleting a state referenced by factions or recognized/de-facto cells is rejected;
- changing ruler does not move factions between states.

Run:
```bash
npx vitest run src/states/stateService.test.ts
```
Expected: FAIL because service does not exist.

- [ ] **Step 2: Implement state service as pure mutations/validation.**

Use concrete service types and signatures:
```ts
export type StateMutationFailure =
  | "STATE_NOT_FOUND"
  | "SIDE_NOT_FOUND"
  | "STATE_RULING_FACTION_REQUIRED"
  | "RULING_FACTION_MUST_BELONG_TO_STATE"
  | "STATE_STILL_REFERENCED";

export type StateMutationResult =
  | { ok: true; states: StateEntity[]; sides: Side[] }
  | { ok: false; reason: StateMutationFailure };

export function validateStateConfiguration(
  state: StateEntity,
  sides: readonly Side[]
): { ok: true } | { ok: false; reason: "STATE_RULING_FACTION_REQUIRED" | "RULING_FACTION_MUST_BELONG_TO_STATE" };

export function createState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  state: StateEntity
): StateMutationResult;

export function updateState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  stateId: string,
  patch: Partial<Pick<StateEntity, "name" | "color" | "rulingFactionId" | "active">>
): StateMutationResult;

export function setSideState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  sideId: string,
  stateId: string | null
): StateMutationResult;

export function deleteState(
  states: readonly StateEntity[],
  sides: readonly Side[],
  gridMap: GridMapState,
  stateId: string
): StateMutationResult;
```
No UI logic in this module.

- [ ] **Step 3: Tighten command payloads and validation.**

Keep the existing state commands but make the state payload include `color`. Validate hex-like CSS color strings consistently with faction colors. Reject crafted invalid state/ruler combinations in `CommandProcessor`, not only in React.

- [ ] **Step 4: Run focused GREEN tests.**

```bash
npx vitest run src/states/stateService.test.ts src/states/stateRules.test.ts src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/states src/commands/commandProcessor.ts src/commands/commandValidation.ts src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts src/shared/permissions.ts
git commit -m "feat: enforce state and ruling faction invariants"
```

---

### Task 3: Implement directional military access and pairwise war

**Files:**
- Create: `src/states/stateRelations.ts`
- Create: `src/states/stateRelations.test.ts`
- Modify: `src/states/stateRules.ts`
- Modify: `src/wars/warRules.ts`
- Modify: `src/annexation/annexationRules.ts`
- Modify: `src/annexation/annexationRules.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandProcessor.ts`
- Modify: `src/shared/permissions.ts`
- Add focused command tests under `src/commands/`

- [ ] **Step 1: Add RED tests for pairwise semantics.**

Required cases:
- A→B access true does not imply B→A;
- setting both directions works only when both commands are issued;
- war A↔B is symmetric;
- war A↔B does not grant A access to C;
- a legacy three-state `WarState` does not authorize every pair by itself;
- starting the same A↔B war twice is idempotent/no duplicate active pair;
- ending A↔B war clears only that pair;
- annexation checks exact pairwise `atWar`, not generic participation.

Run:
```bash
npx vitest run src/states/stateRelations.test.ts src/annexation/annexationRules.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Implement the relation helpers.**

Use canonical helpers:
```ts
export function hasMilitaryAccess(relations: StateRelations, fromStateId: string, toStateId: string): boolean;
export function areStatesAtWar(relations: StateRelations, leftStateId: string, rightStateId: string): boolean;
export function setMilitaryAccess(relations: StateRelations, fromStateId: string, toStateId: string, allowed: boolean): StateRelations;
export function setPairWar(relations: StateRelations, leftStateId: string, rightStateId: string, atWar: boolean): StateRelations;
```
`setPairWar` must write both directions. `setMilitaryAccess` writes only one direction.

- [ ] **Step 3: Add authoritative GM commands.**

Add payloads:
```ts
| { type: "SET_STATE_MILITARY_ACCESS"; fromStateId: string; toStateId: string; allowed: boolean }
| { type: "SET_STATE_WAR"; leftStateId: string; rightStateId: string; atWar: boolean }
```
Both are GM-only through `authorizeArmyCommand`. Validate both states exist, are distinct, active, and politically valid.

When `SET_STATE_WAR` changes stateRelations, also maintain one pairwise `WarState` history object for UI/history. New interstate wars must have exactly two `participantStateIds`; legacy wars remain readable but do not authorize movement.

- [ ] **Step 4: Replace old generic war helpers in runtime consumers.**

`src/wars/warRules.ts` must stop exposing `isFactionAtWar()` as movement authorization. `src/annexation/annexationRules.ts` must query pairwise relation state.

- [ ] **Step 5: Run GREEN.**

```bash
npx vitest run src/states/stateRelations.test.ts src/annexation/annexationRules.test.ts src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/states src/wars/warRules.ts src/annexation src/shared/types.ts src/commands src/shared/permissions.ts
git commit -m "feat: add interstate access and pairwise war"
```

---

### Task 4: Remove faction territory from map editing and preserve independent layers

**Files:**
- Modify: `src/terrain/gridMap.ts`
- Modify: `src/terrain/gridMap.test.ts` or create it if absent
- Modify: `src/owlbear/mapBrushTool.ts`
- Modify: `src/owlbear/mapBrushTool.test.ts`
- Modify: `src/background/mapBrushToolService.ts`
- Modify: `src/background/mapBrushToolService.test.ts`
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/ui/pages/MapEditorPage.tsx`
- Modify: `src/ui/pages/MapEditorPage.test.tsx`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandProcessor.ts`

- [ ] **Step 1: Add RED layer-isolation tests.**

Prove:
- painting recognized state preserves `terrainId`, `impassable`, `deFactoStateId`;
- painting terrain preserves `recognizedStateId` and `deFactoStateId`;
- erasing recognized state preserves terrain;
- map brush metadata/settings no longer expose `FACTION_TERRITORY` or `SELECTED_FACTION`;
- crafted legacy `UPDATE_FACTION_TERRITORY_CELLS` cannot affect new runtime authorization; after protocol v5 it should be rejected as an invalid current command.

Run:
```bash
npx vitest run src/terrain/gridMap.test.ts src/owlbear/mapBrushTool.test.ts src/background/mapBrushToolService.test.ts src/ui/pages/MapEditorPage.test.tsx
```
Expected: FAIL.

- [ ] **Step 2: Remove faction-territory brush commands/modes from the current protocol and UI.**

Current UI modes become:
```ts
"TERRAIN" | "IMPASSABLE" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ERASER"
```
Current eraser targets become:
```ts
"TERRAIN" | "IMPASSABLE" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ALL"
```
Keep old serialized `factionTerritoryIds` only inside scene migration/normalization.

- [ ] **Step 3: Keep cell patch operations field-specific.**

Do not replace entire cells when painting. Ensure each command produces only its intended patch, for example:
```ts
{ field: "recognizedStateId", value: stateId }
```
or equivalent existing `CellPatchOperation` representation.

- [ ] **Step 4: Simplify MapEditorPage.**

The map page should paint terrain/state/control only. Remove state CRUD and faction membership management from this page; those move to the dedicated states UI in Task 6.

- [ ] **Step 5: Run GREEN and commit.**

```bash
npx vitest run src/terrain/gridMap.test.ts src/owlbear/mapBrushTool.test.ts src/background/mapBrushToolService.test.ts src/ui/pages/MapEditorPage.test.tsx
npm run typecheck
git add src/terrain src/owlbear/mapBrushTool.ts src/background/mapBrushToolService.ts src/ui/state/useExtensionState.ts src/ui/pages/MapEditorPage.tsx src/commands
git commit -m "refactor: remove faction territory map editing"
```

---

### Task 5: Render state borders over terrain without obscuring it

**Files:**
- Create: `src/states/stateBoundaryOverlay.ts`
- Create: `src/states/stateBoundaryOverlay.test.ts`
- Modify: `src/terrain/mapOverlayService.ts`
- Modify: `src/terrain/mapOverlayService.test.ts`
- Modify: `src/background/application.ts` only where overlay input is assembled

- [ ] **Step 1: Add RED geometry tests for state boundaries.**

For each recognized-state cell, create an edge only where the orthogonal neighbor has a different `recognizedStateId` or no state. Shared edges between same-state cells must not be drawn twice.

Use state color from `StateEntity.color`.

Run:
```bash
npx vitest run src/states/stateBoundaryOverlay.test.ts src/terrain/mapOverlayService.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Implement pure boundary extraction.**

Expose:
```ts
export interface StateBoundarySegment {
  stateId: string;
  from: Vector2;
  to: Vector2;
  color: string;
}

export function buildStateBoundarySegments(input: {
  gridMap: GridMapState;
  states: readonly StateEntity[];
  dpi: number;
}): StateBoundarySegment[];
```

- [ ] **Step 3: Change MapOverlayService composition.**

Terrain remains a low-opacity full-cell fill. Remove faction territory labels. Add state border curves above terrain. Keep de-facto control distinguishable without replacing the terrain fill; retain a concise GM-only label/secondary outline if needed.

Add a regression proving a mountain/forest terrain overlay and Russia’s boundary both exist on the same cell.

- [ ] **Step 4: Run GREEN and commit.**

```bash
npx vitest run src/states/stateBoundaryOverlay.test.ts src/terrain/mapOverlayService.test.ts
npm run typecheck
git add src/states/stateBoundaryOverlay.ts src/states/stateBoundaryOverlay.test.ts src/terrain/mapOverlayService.ts src/terrain/mapOverlayService.test.ts src/background/application.ts
git commit -m "feat: render state borders over terrain"
```

---

### Task 6: Add state administration and interstate diplomacy UI

**Files:**
- Create: `src/ui/pages/StatesPage.tsx`
- Create: `src/ui/pages/StatesPage.test.tsx`
- Create: `src/ui/pages/StateDiplomacyPage.tsx`
- Create: `src/ui/pages/StateDiplomacyPage.test.tsx`
- Modify: `src/ui/pages/ManagementPage.tsx`
- Modify: `src/ui/pages/ManagementPage.test.tsx` if present
- Modify: `src/ui/pages/SidesPage.tsx` only if the state selector is kept there
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: snapshot construction service (currently the service that builds `RawExtensionSnapshot`)
- Modify: `src/owlbear/snapshotEquality.ts`
- Modify: `src/owlbear/snapshotEquality.test.ts`
- Modify: UI CSS file(s) used by management pages

- [ ] **Step 1: Add RED UI tests.**

`StatesPage` must show:
- name;
- color;
- active state;
- factions derived from `Side.stateId`;
- ruler selector filtered to factions already belonging to this state;
- create-state flow that cannot activate without a valid ruler;
- membership reassignment controls.

`StateDiplomacyPage` must show each unordered pair A/B with:
- A→B military access toggle;
- B→A military access toggle;
- one A↔B war toggle.

Run:
```bash
npx vitest run src/ui/pages/StatesPage.test.tsx src/ui/pages/StateDiplomacyPage.test.tsx src/owlbear/snapshotEquality.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Extend snapshots.**

Add:
```ts
stateRelations: StateRelations;
```
to `RawExtensionSnapshot`, extension view model, snapshot builder, and `semanticSnapshotEqual`. A military-access/war change must publish immediately without relying on unrelated state changes.

- [ ] **Step 3: Add management sections.**

Use explicit management sections:
```ts
type ManagementSection =
  | "SIDES"
  | "STATES"
  | "STATE_DIPLOMACY"
  | "RELATIONS"
  | "WARS"
  | "SETTINGS"
  | "DIAGNOSTICS";
```
Keep the existing faction `RelationsPage` because faction ALLY/NEUTRAL/ENEMY still serves faction-level mechanics and is not the state-border authorization model.

The old generic `WarsPage` remains only for legacy/history until all non-movement consumers are audited; movement must never read it as broad authorization.

- [ ] **Step 4: Wire commands.**

State UI sends the existing `CREATE_STATE` / `UPDATE_STATE` / `SET_SIDE_STATE` / `DELETE_STATE` commands. Diplomacy sends `SET_STATE_MILITARY_ACCESS` and `SET_STATE_WAR`.

- [ ] **Step 5: Run GREEN and commit.**

```bash
npx vitest run src/ui/pages/StatesPage.test.tsx src/ui/pages/StateDiplomacyPage.test.tsx src/owlbear/snapshotEquality.test.ts
npm run typecheck
git add src/ui src/owlbear/snapshotEquality.ts src/owlbear/snapshotEquality.test.ts
git commit -m "feat: add state and diplomacy administration"
```

---

### Task 7: Replace faction-territory movement authorization with one state access classifier

**Files:**
- Create: `src/movement/stateMovementAccess.ts`
- Create: `src/movement/stateMovementAccess.test.ts`
- Modify: `src/movement/movementRules.ts`
- Modify: `src/movement/movementRules.test.ts`
- Modify: `src/wars/warRules.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/owlbear/notifications.ts`
- Modify: `src/owlbear/notifications.test.ts`

- [ ] **Step 1: Add RED classifier table tests.**

Cover this exact matrix:

| mover | destination | relation | result |
|---|---|---|---|
| any faction of A | A | any | `ALLOW_OWN_STATE` |
| any faction of A | unowned | any | `ALLOW_UNOWNED` |
| any faction of A | B | A→B access | `ALLOW_MILITARY_ACCESS` |
| any faction of A | B | A↔B war | `ALLOW_WAR` |
| non-ruling faction of A | B | none | `DENY_FOREIGN_STATE` |
| ruling faction of A | B | none | `DECLARE_WAR_AND_ALLOW` |
| stateless faction | B | any | `DENY_STATELESS` |
| invalid/inactive source or destination state | state-owned cell | any | `DENY_INVALID_POLITICAL_CONFIG` |

Also prove legacy `factionTerritoryIds` never changes any result.

Run:
```bash
npx vitest run src/movement/stateMovementAccess.test.ts src/movement/movementRules.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Implement the pure classifier.**

Use:
```ts
export type StateMovementAccess =
  | { kind: "ALLOW_OWN_STATE" }
  | { kind: "ALLOW_UNOWNED" }
  | { kind: "ALLOW_MILITARY_ACCESS"; destinationStateId: string }
  | { kind: "ALLOW_WAR"; destinationStateId: string }
  | { kind: "DECLARE_WAR_AND_ALLOW"; sourceStateId: string; destinationStateId: string }
  | { kind: "DENY_FOREIGN_STATE"; destinationStateId: string }
  | { kind: "DENY_STATELESS"; destinationStateId: string }
  | { kind: "DENY_INVALID_POLITICAL_CONFIG" };
```

- [ ] **Step 3: Integrate with movementRules without side effects.**

`validateMovementStep` still validates orthogonality, bounds, impassability, terrain and OP. It calls the political classifier and maps hard denials to new `MovementDenialReason`s:
```ts
"FOREIGN_STATE_CLOSED"
"STATELESS_FACTION"
"INVALID_POLITICAL_CONFIG"
```
`DECLARE_WAR_AND_ALLOW` is allowed in planning but returned as a warning/classification, never as a mutation.

Remove `OUTSIDE_FACTION_TERRITORY` from current runtime messages and route logic after all callers migrate.

- [ ] **Step 4: Add Russian messages.**

At minimum:
```text
FOREIGN_STATE_CLOSED -> "У этой фракции нет права входа на территорию государства."
STATELESS_FACTION -> "Фракция без государства не может входить на государственную территорию."
INVALID_POLITICAL_CONFIG -> "Настройки государства или правящей фракции некорректны."
WAR_DECLARATION_FAILED -> "Не удалось объявить войну; армия не пересекла границу."
```

- [ ] **Step 5: Run GREEN and commit.**

```bash
npx vitest run src/movement/stateMovementAccess.test.ts src/movement/movementRules.test.ts src/owlbear/notifications.test.ts
npm run typecheck
git add src/movement src/wars/warRules.ts src/shared/types.ts src/owlbear/notifications.ts src/owlbear/notifications.test.ts
git commit -m "feat: authorize land movement by state borders"
```

---

### Task 8: Make route planning warn about invasion without declaring war

**Files:**
- Modify: `src/owlbear/routeTool.ts`
- Modify: `src/owlbear/routeTool.test.ts`
- Modify: `src/background/routeToolService.ts`
- Modify: `src/background/routeToolService.test.ts`
- Modify: `src/owlbear/routeToolIntegration.ts` only if activation payload types are declared there
- Modify: route preview regression tests under `src/owlbear/`

- [ ] **Step 1: Add RED route-planning tests.**

Required behavior:
- ordinary faction cannot click/commit into closed foreign state;
- ordinary faction can plan through military access;
- ordinary faction can plan into a specific enemy state during war;
- ruling faction can plan through closed foreign territory;
- ruling-faction preview is valid but orange/warning and names the destination state;
- planning and committing the route does not mutate `stateRelations.atWar`;
- a route A→B→C carries distinct warning states for B and C where appropriate.

Run:
```bash
npx vitest run src/owlbear/routeTool.test.ts src/background/routeToolService.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Extend RouteToolActivation with political context.**

Pass read-only copies of:
```ts
sides: readonly Side[];
states: readonly StateEntity[];
stateRelations: StateRelations;
```
plus the existing `sideId`, `gridMap`, terrain and wars/history.

- [ ] **Step 3: Render invasion warnings as allowed previews.**

For `DECLARE_WAR_AND_ALLOW`, use a warning presentation such as:
```ts
{
  valid: true,
  color: "#f9a825",
  warning: "DECLARE_WAR_ON_ENTRY",
  label: "⚠ Вход в Германию объявит войну"
}
```
Do not send any diplomacy command from the route tool.

- [ ] **Step 4: Run GREEN and commit.**

```bash
npx vitest run src/owlbear/routeTool.test.ts src/background/routeToolService.test.ts src/owlbear/routePlanningUx.regression.test.ts
npm run typecheck
git add src/owlbear/routeTool.ts src/owlbear/routeTool.test.ts src/background/routeToolService.ts src/background/routeToolService.test.ts src/owlbear/routeToolIntegration.ts
git commit -m "feat: warn on planned interstate invasions"
```

---

### Task 9: Enforce state access during authoritative army movement and auto-declare war atomically

**Files:**
- Modify: `src/background/application.ts`
- Create: `src/background/stateBorderMovement.integration.test.ts`
- Create: `src/background/automaticWarDeclaration.integration.test.ts`
- Modify: `src/movement/strategicProgress.ts` only if a helper is needed to identify the next entered strategic cell
- Modify: `src/annexation/annexationRules.ts` only to consume the new pairwise war relation
- Modify: persistence test harnesses as needed

- [ ] **Step 1: Add RED end-to-end movement tests.**

Use the real `ProductionEngine` path, not only pure functions. Cover:
- ordinary faction stops before a closed foreign cell;
- ordinary faction enters with A→B military access;
- reverse direction is denied when only A→B exists;
- ordinary faction enters B when A↔B war is active;
- war A↔B does not permit entering C;
- ruling faction crossing A→B with no relation creates pairwise war and enters B;
- repeated entry while at war creates no duplicate war;
- route A→B→C declares each war only at actual crossing;
- army collision still creates/join BattleGroup after political access succeeds;
- SEA ship movement tests remain unchanged/green.

Run:
```bash
npx vitest run src/background/stateBorderMovement.integration.test.ts src/background/automaticWarDeclaration.integration.test.ts src/battles/collisionEngine.test.ts
```
Expected: FAIL.

- [ ] **Step 2: Classify the next cell before movement commit.**

In `ProductionEngine.movementTickNow`, before committing an army’s entrance into a new strategic cell:
1. read destination `CellState`;
2. classify state access;
3. hard denial => do not cross the cell boundary; pause/mark route invalid with the exact denial reason;
4. normal allow => continue;
5. `DECLARE_WAR_AND_ALLOW` => stage pairwise war mutation first.

Do not change `advanceArmy` into a political engine; keep it geometric/interpolation-only. Political decisions stay in the ProductionEngine orchestration layer.

- [ ] **Step 3: Make auto-war + movement transactional with the existing rollback model.**

Use the existing scene/army metadata commit/rollback mechanism in `application.ts`. Required semantic order:
```text
prepare new scene with atWar(A,B)=true
prepare army/item position update
write both under revision/precondition guards
if either persistence write fails -> rollback the other
publish only after both succeed
```

Add a failure-injection integration test: if scene war persistence fails, the army position remains on the original side of the border; if army/item persistence fails after war write, the war write is rolled back.

- [ ] **Step 4: Preserve collision ordering.**

Final order must be:
```text
political access -> optional war creation -> movement cell entry -> enemy army collision/battle -> annexation/de-facto mechanics where already applicable
```
Do not make state access prohibit army-on-army cell occupancy.

- [ ] **Step 5: Run GREEN and commit.**

```bash
npx vitest run src/background/stateBorderMovement.integration.test.ts src/background/automaticWarDeclaration.integration.test.ts src/battles/collisionEngine.test.ts src/annexation/annexationRules.test.ts
npm run typecheck
git add src/background/application.ts src/background/stateBorderMovement.integration.test.ts src/background/automaticWarDeclaration.integration.test.ts src/movement/strategicProgress.ts src/annexation
git commit -m "feat: declare state wars on authoritative border entry"
```

---

### Task 10: Remove all runtime reliance on faction territory and audit consumers

**Files:**
- Modify/delete behavior in: `src/wars/warRules.ts`
- Search/audit all references to: `factionTerritoryIds`, `OUTSIDE_FACTION_TERRITORY`, `UPDATE_FACTION_TERRITORY_CELLS`, `FACTION_TERRITORY`, `SELECTED_FACTION`, `isFactionAtWar`
- Modify affected tests and docs
- Keep migration/normalization compatibility only where explicitly required

- [ ] **Step 1: Run a repository-wide reference audit.**

```bash
grep -R "factionTerritoryIds\|OUTSIDE_FACTION_TERRITORY\|UPDATE_FACTION_TERRITORY_CELLS\|FACTION_TERRITORY\|SELECTED_FACTION\|isFactionAtWar" -n src docs
```

Classify every hit as either:
- migration/backward-compatibility: allowed;
- current runtime/UI/test expectation: must be removed/replaced.

- [ ] **Step 2: Add a regression proving legacy faction territory has zero movement authority.**

Create a scene where a cell contains the mover faction in `factionTerritoryIds` but belongs via `recognizedStateId` to a closed foreign state. Expected: movement denied for non-ruler and invasion warning/auto-war path for ruler according to state rules; the legacy field has no effect.

- [ ] **Step 3: Remove remaining runtime branches.**

`src/wars/warRules.ts` may retain only compatibility/history helpers still genuinely used; delete `canFactionEnterCell` and broad `isFactionAtWar` if no valid non-movement consumer remains.

- [ ] **Step 4: Run focused search again.**

Expected remaining `factionTerritoryIds` hits are limited to legacy type/validation/migration fixtures/comments, never movement or UI.

- [ ] **Step 5: Commit.**

```bash
git add src docs
git commit -m "refactor: retire faction territory runtime logic"
```

---

### Task 11: Full regression suite, manual QA checklist, and integration PR

**Files:**
- Create: `docs/manual-state-territory-access-test.md`
- Modify: any stale docs that claim faction-owned territories or generic-war movement access
- Modify: `package.json` / manifest only if the release version is intentionally bumped at merge time

- [ ] **Step 1: Add a concise four-client/manual QA checklist.**

Include GM + ruling leader + ordinary faction leader + foreign faction leader. Exercise:
- create Russia/Germany/France with colors and rulers;
- assign multiple factions to Russia;
- paint Russian mountains and confirm both mountain terrain and Russian border remain visible;
- change terrain without losing Russia ownership;
- directional Russia→Germany passage and denied Germany→Russia reverse;
- ordinary Russian faction invasion during Russia–Germany war;
- ordinary Russian faction denied from France with no relation;
- ruling Russian faction plans France route and sees warning but no war yet;
- actual border entry creates Russia–France war;
- subsequent French cell entry does not duplicate war;
- army collision inside invaded territory still starts battle;
- ships still ignore land-state borders and still cannot share a ship cell.

- [ ] **Step 2: Run the complete automated gate.**

```bash
npm ci
npm audit --audit-level=high
npm run check
```
Expected: typecheck, lint, every Vitest file/test, and Vite production build all pass.

- [ ] **Step 3: Verify current-protocol reference cleanup.**

```bash
grep -R "FACTION_TERRITORY\|UPDATE_FACTION_TERRITORY_CELLS\|OUTSIDE_FACTION_TERRITORY" -n src
```
Expected: no current runtime/protocol/UI hits. If compatibility parsing intentionally retains one, document the exact file and why it cannot authorize movement.

- [ ] **Step 4: Review persistence and snapshot behavior.**

Run targeted suites:
```bash
npx vitest run src/storage/migrations.test.ts src/storage/metadataRepository.test.ts src/owlbear/snapshotEquality.test.ts src/background/stateBorderMovement.integration.test.ts src/background/automaticWarDeclaration.integration.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit documentation and final cleanup.**

```bash
git add docs src package.json package-lock.json
# include package files only if they actually changed
git commit -m "docs: add state territory QA coverage"
```

- [ ] **Step 6: Prepare the implementation PR summary.**

The PR description must explicitly state:
- state territory replaces faction territory;
- terrain and political ownership are independent;
- access is directional;
- war is exact-pair and symmetric;
- all factions may invade during their state’s war;
- only the ruling faction may auto-declare war by crossing a closed border;
- route planning warns but never declares war;
- army collisions remain unchanged;
- sea movement remains outside land-state access rules;
- legacy scenes migrate without inventing territory.
