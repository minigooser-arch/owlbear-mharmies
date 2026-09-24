# Operations UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make diplomacy and strategic-city management quick to understand and operate in Owlbear's narrow panel.

**Architecture:** Keep current command payloads and domain models. Rework the diplomacy view around a selected state and expandable counterpart rows; make city forms responsive, searchable, and easy to populate from map clicks. Reuse the existing coordinate tool through a session-scoped click channel so picking cells does not change normal coordinate-inspection behavior.

**Tech Stack:** React 19, TypeScript, Owlbear Rodeo SDK 3.1, CSS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-operations-ux-and-backend-performance-design.md`

## Global Constraints

- Do not change diplomacy rules or command payloads.
- Preserve the current city model, validation rules, and command types.
- Keep exact direction labels for access: whose troops can enter whose territory.
- Preserve cell-coordinate behavior and role checks.
- Keep narrow Owlbear panels usable; labels stack above full-width controls.

## Review Focus

- A state list that becomes empty or changes after render must not leave an invalid selected-state ID; test state removal and the fewer-than-two empty state in Task 1.
- Opposite military-access directions and symmetric war must remain independent; test both directions and war in Task 1.
- Generated city IDs can collide after transliteration or repeated names; test deterministic suffixing and manual override in Task 2.
- Map clicks from an old or other player's picker session must not enter the current city draft; test session matching and GM-only activation in Task 3.
- Duplicate map clicks and cancel/finish sequences must not lose or duplicate cells; test deduplication and draft restoration in Task 3.

---

### Task 1: Compact state diplomacy

**Files:**
- Modify: `src/ui/pages/StateDiplomacyPage.tsx`
- Test: `src/ui/pages/StateDiplomacyPage.test.tsx`
- Modify: `src/ui/app.css`
- Modify: `src/ui/wiki-light.css`

**Interfaces:**
- Consumes: `StateDiplomacyPage({ states, stateRelations, onAction })` and existing `SET_STATE_MILITARY_ACCESS` / `SET_STATE_WAR` commands.
- Produces: a selected-state view with one row per counterpart; row expansion reveals two directional access controls and one symmetric war control. No new domain or command interfaces.

- [ ] **Step 1: Add behavior tests for selection, filtering, and exact direction semantics.**

Add tests proving that selecting Russia renders only Germany and France as counterpart rows, search narrows the rows by counterpart name, and the `WAR` filter keeps only pairs at war. Expand a row and assert the accessible labels remain `Доступ войскам Россия на территорию Германия`, `Доступ войскам Германия на территорию Россия`, and `Война Россия — Германия`. Click each access switch independently and verify its `fromStateId` / `toStateId`; click war and verify the symmetric war command.

- [ ] **Step 2: Run the diplomacy tests and confirm the new cases fail.**

Run: `npm test -- src/ui/pages/StateDiplomacyPage.test.tsx --reporter=dot`

Expected: the new selected-state, filter, and disclosure cases fail against the current all-pairs layout.

- [ ] **Step 3: Implement the selected-state list and compact disclosure rows.**

Use `useState` for selected state ID, query, and `ALL | WAR | ACCESS` filter. Reconcile the selected ID whenever the `states` prop changes: use the first available state if the previous ID disappeared, and `""` if there are no states. Derive counterpart rows from the selected state, filter by normalized names and status, and render one expandable row per counterpart. Keep the existing empty state when fewer than two states exist. Add scoped diplomacy classes; make the controls wrap at narrow widths and retain visible keyboard focus. Keep filtering derived from current props rather than copying relation data into state:

```ts
const selected = states.find((state) => state.id === selectedStateId);
const rows = states.filter((state) => state.id !== selected?.id)
  .filter((state) => state.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  .filter((state) => filter === "ALL" || matchesRelationFilter(selected, state, stateRelations, filter));
```

- [ ] **Step 4: Run the focused tests and verify the exact command payloads.**

Run: `npm test -- src/ui/pages/StateDiplomacyPage.test.tsx --reporter=dot`

Expected: PASS; the UI reduces the displayed list to O(number of states) for the selected state and keeps the two access directions independent.

- [ ] **Step 5: Commit the diplomacy screen.**

```bash
git add src/ui/pages/StateDiplomacyPage.tsx src/ui/pages/StateDiplomacyPage.test.tsx src/ui/app.css src/ui/wiki-light.css
git commit -m "feat: simplify state diplomacy controls"
```

### Task 2: Responsive city list and forms

**Files:**
- Modify: `src/ui/components/StrategicCityEditor.tsx`
- Test: `src/ui/components/StrategicCityEditor.test.tsx`
- Modify: `src/ui/app.css`
- Modify: `src/ui/wiki-light.css`

**Interfaces:**
- Consumes: existing `StrategicCityEditorProps`, city command callbacks, and `StrategicCity` fields.
- Produces: a responsive editor with `name`, `stateId`, `cells`, `historicalBuildTypeCount`, and `capital`; a deterministic `cityIdForName(name, existingIds)` helper used only by the editor; search and state filters over existing cities.

- [ ] **Step 1: Add tests for generated IDs, collision suffixes, city filters, and role visibility.**

Test that `Москва` generates `moskva`, a second conflicting ID generates `moskva-2`, a manual ID entered under the advanced disclosure takes precedence, and filtering by state/search changes only the visible city rows. Test that editing a city with different recognized and de-facto owners preserves its existing de-facto owner. Keep the current PLAYER test proving mutation controls stay hidden. Update create/edit tests to use the visible accessible labels after the form is grouped into sections.

- [ ] **Step 2: Run city editor tests and confirm the new cases fail.**

Run: `npm test -- src/ui/components/StrategicCityEditor.test.tsx --reporter=dot`

Expected: the ID-generation, filtering, and advanced-field cases fail against the current always-manual inputs and unfiltered list.

- [ ] **Step 3: Build the responsive city form and compact expandable cards.**

Add a city form grid class to both create and edit forms. Put name and recognized state first, historical build count and capital next, and manual ID / text-coordinate entry under `<details>` as advanced controls. Generate a slug from the name, transliterate Russian letters, normalize separators, and append `-2`, `-3`, etc. until unique; use a manual ID when non-empty. For example, generate the base ID once, then suffix collisions deterministically:

```ts
function cityIdForName(name: string, usedIds: ReadonlySet<string>): string {
  const base = slugifyRussianName(name) || "city";
  let candidate = base;
  for (let suffix = 2; usedIds.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
  return candidate;
}
```

Add a city search and state selector. City cards show name, recognized state, capital, and cell count first; put coordinates, copy, and edit/delete actions in expanded details. On update, only change the recognized owner selected in this editor; preserve the existing `deFactoStateId` field to avoid silently overwriting distinct control. New cities continue to initialize both owner fields from the selected state. Keep all input labels block-stacked and inputs full-width below 420 px.

- [ ] **Step 4: Run the city tests and verify create/update payload parity.**

Run: `npm test -- src/ui/components/StrategicCityEditor.test.tsx --reporter=dot`

Expected: PASS; create callbacks initialize both owner fields from the selected state, update callbacks preserve a distinct de-facto owner, and command types remain unchanged.

- [ ] **Step 5: Commit the responsive city editor.**

```bash
git add src/ui/components/StrategicCityEditor.tsx src/ui/components/StrategicCityEditor.test.tsx src/ui/app.css src/ui/wiki-light.css
git commit -m "feat: improve strategic city editor"
```

### Task 3: Session-scoped city cell picking

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/ui/components/StrategicCityEditor.tsx`
- Test: `src/ui/components/StrategicCityEditor.test.tsx`
- Modify: `src/owlbear/cellCoordinateTool.ts`
- Test: `src/owlbear/cellCoordinateTool.test.ts`
- Modify: `src/owlbear/extensionServicesCore.ts`
- Test: `src/owlbear/extensionServicesCore.cityCellPicker.test.ts` (create)
- Modify: `src/background/applicationCore.ts`

**Interfaces:**
- Consumes: the registered coordinate tool, existing `OwlbearPort.send/on`, and `UiCommand` service dispatch.
- Produces: `CITY_CELL_PICK_CHANNEL`, `CITY_CELL_PICK_SESSION_KEY`, `UiCommand` actions `OPEN_CITY_CELL_PICKER` and `CLOSE_CITY_CELL_PICKER`, and optional `RawExtensionSnapshot.cityCellPick: { sessionId: string; cells: GridCellCoord[] }`. The tool emits `{ sessionId, x, y }` only while the session key is present. `StrategicCityEditorProps` accepts `onOpenCellPicker()`, `onCloseCellPicker()`, and `pickedCells`.

- [ ] **Step 1: Add tool and UI tests for session isolation and cell deduplication.**

Extend the coordinate-tool harness with a fake `send` port and session metadata. Test that an ordinary coordinate click still shows and pins labels without emitting a city-pick event; with a session key it emits `{ sessionId, x, y }`; with another session ID the UI ignores the event. Test that clicking the same cell twice displays one chip, adding a second cell displays two, finish applies both to the draft, and cancel restores the prior cell set.

- [ ] **Step 2: Run coordinate-tool and city-editor tests and confirm the new cases fail.**

Run: `npm test -- src/owlbear/cellCoordinateTool.test.ts src/ui/components/StrategicCityEditor.test.tsx --reporter=dot`

Expected: new session and selection cases fail; existing normal coordinate-inspection tests pass.

- [ ] **Step 3: Emit a session-tagged coordinate event from the existing tool.**

Read `CITY_CELL_PICK_SESSION_KEY` from `ToolContext.metadata` in the click handler. When present, call the tool port's `send(CITY_CELL_PICK_CHANNEL, { sessionId, x: cell.x, y: cell.y })`; preserve hover/pinned overlays and click return behavior. Do not send if the session ID is absent or malformed. Extend `CellCoordinateToolPort` with the broadcast `send` signature and pass the existing Owlbear port method through the `toolPort` already supplied to `registerCellCoordinateTool`.

- [ ] **Step 4: Add start/finish handling and publish the active selection to the editor.**

In `extensionServicesCore`, intercept `OPEN_CITY_CELL_PICKER` / `CLOSE_CITY_CELL_PICKER` before command-gateway dispatch. Opening stores the previously active tool, creates a UUID session, writes the session metadata, activates the coordinate tool and mode, and verifies activation. Closing clears the session metadata and restores the saved tool. Subscribe to `CITY_CELL_PICK_CHANNEL`; accept only events matching the current session and GM role, append unique integer coordinates, and publish a snapshot update. Remove the listener and clear session state in `stop()`. Add `src/owlbear/extensionServicesCore.cityCellPicker.test.ts` for successful activation, activation-failure cleanup, stale-session rejection, cancel restoration, and listener removal.

- [ ] **Step 5: Wire picker controls into `StrategicCityEditor` and keep the draft recoverable.**

Pass the picker callbacks and active selected cells from `App.tsx`. While selection is active, show concise instructions plus `Завершить выбор` and `Отменить`; show selected coordinates as removable chips. On finish, merge the chosen cells with the form's existing cells without duplicates. On cancel, keep the form's original cells. Disable picker actions for non-GM and when the scene is not ready.

- [ ] **Step 6: Run focused tests and verify activation cleanup.**

Run: `npm test -- src/owlbear/cellCoordinateTool.test.ts src/owlbear/extensionServicesCore.cityCellPicker.test.ts src/ui/components/StrategicCityEditor.test.tsx --reporter=dot`

Expected: PASS; stale sessions are ignored, switching tools clears the session, cancel restores the prior tool, and normal coordinate inspection is unchanged.

- [ ] **Step 7: Commit city map selection.**

```bash
git add src/shared/constants.ts src/ui/state/useExtensionState.ts src/ui/components/StrategicCityEditor.tsx src/ui/components/StrategicCityEditor.test.tsx src/owlbear/cellCoordinateTool.ts src/owlbear/cellCoordinateTool.test.ts src/owlbear/extensionServicesCore.ts src/owlbear/extensionServicesCore.cityCellPicker.test.ts src/background/applicationCore.ts src/ui/App.tsx
git commit -m "feat: pick strategic city cells from map"
```

### Task 4: UI integration verification

**Files:**
- Test: `src/ui/GmUserJourney.test.tsx`
- Test: `src/ui/PlayerUserJourney.test.tsx`
- Modify only if required: `src/ui/App.tsx`, `src/ui/app.css`, `src/ui/wiki-light.css`

**Interfaces:**
- Consumes: the completed diplomacy, city, and picker components.
- Produces: journey coverage confirming the GM-only workflows remain isolated from player views.

- [ ] **Step 1: Add journey assertions for diplomacy and city administration.**

In the GM journey, verify that the Management → diplomacy controls render the selected-state list and that the Cities tab exposes create, map-pick, finish/cancel, search, and edit actions. In the player journey, verify that Cities and Management are absent and no city-pick command can be started.

- [ ] **Step 2: Run both journey suites.**

Run: `npm test -- src/ui/GmUserJourney.test.tsx src/ui/PlayerUserJourney.test.tsx --reporter=dot`

Expected: PASS with GM-only city management preserved.

- [ ] **Step 3: Commit integration coverage.**

```bash
git add src/ui/GmUserJourney.test.tsx src/ui/PlayerUserJourney.test.tsx
git commit -m "test: cover diplomacy and city admin journeys"
```
