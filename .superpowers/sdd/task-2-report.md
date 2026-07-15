# Task 2 Report: Authorized Army Lists and Editable Battle Names

## Status

Implemented Task 2 for Letopis Armies v1.2. Player army lists and counters now contain only armies from every side the player belongs to, independently of map detection/local clones. GMs can rename battle groups through an accessible editor; runtime validation trims names, counts Unicode code points, and returns specific failures.

## Implementation

- Added the `RENAME_BATTLE_GROUP` command payload with `battleId` and `name`.
- Added runtime parsing that trims battle names and accepts 1 through 80 Unicode code points using `[...trimmed].length`.
- Invalid rename names preserve a valid `requestId` and return `INVALID_BATTLE_NAME`; missing groups return `BATTLE_NOT_FOUND`.
- Kept the existing authorization model intact: GM commands are allowed first, while non-whitelisted PLAYER commands—including registration, unregistration, and battle rename—remain default-denied as `GM_ONLY`.
- Renames trim the stored name and increment both the battle-group revision and, through the existing processor path, the scene revision.
- Added Russian messages for `INVALID_BATTLE_NAME` and `BATTLE_NOT_FOUND`.
- Renamed the role-safe snapshot field and input to `mapVisibleSourceIds`; the private local-clone extractor retains its descriptive internal name and supplies this map-visibility set.
- `buildRoleSafeSnapshot` now projects all armies for GM and only the union of member-side armies for PLAYER before React receives `ArmyView[]`.
- Map-visible source IDs still include detected/local-clone sources and the player's own armies, without affecting army-card or counter authorization.
- `useExtensionState` repeats the PLAYER member-side filter as defense in depth and never consults `mapVisibleSourceIds` for cards or counters.
- PLAYER side-filter options come only from sides represented by authorized armies. GM registration continues to use every configured side, including empty sides.
- Added an accessible GM battle-name textbox labelled `Название боя`, trimmed rename submission, disabled blank/over-80/unchanged saves, external-name draft synchronization, and the existing release action. PLAYER sees only the read-only battle name.

## Files

Production files:

- `src/shared/types.ts`
- `src/commands/commandValidation.ts`
- `src/commands/commandProcessor.ts`
- `src/owlbear/notifications.ts`
- `src/owlbear/extensionServices.ts`
- `src/ui/state/useExtensionState.ts`
- `src/ui/pages/ArmiesPage.tsx`
- `src/ui/pages/BattlesPage.tsx`
- `src/ui/main.tsx`

Focused and fixture tests:

- `src/commands/commandValidation.test.ts`
- `src/commands/commandProcessor.test.ts`
- `src/owlbear/extensionServices.test.ts`
- `src/ui/state/useExtensionState.test.tsx`
- `src/ui/pages/ArmiesPage.test.tsx`
- `src/ui/pages/BattlesPage.test.tsx` (new)
- `src/ui/App.test.tsx`

`src/shared/permissions.ts` required no production edit because its existing GM-first/default-deny structure already rejects the three crafted PLAYER commands with `GM_ONLY`. `src/ui/App.tsx` required no behavior change because it already forwards non-dangerous `UiCommand` values and supplies GM state to `BattlesPage`.

## TDD Evidence

### Baseline

Before the tests-only patch:

```powershell
npm.cmd test -- src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts src/owlbear/extensionServices.test.ts src/ui/state/useExtensionState.test.tsx src/ui/pages/ArmiesPage.test.tsx
```

Result (exit code 0):

```text
Test Files  5 passed (5)
Tests       98 passed (98)
```

### RED

After adding only the Task 2 tests, the exact brief command was run:

```powershell
npm.cmd test -- src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts src/owlbear/extensionServices.test.ts src/ui/state/useExtensionState.test.tsx src/ui/pages/ArmiesPage.test.tsx src/ui/pages/BattlesPage.test.tsx
```

Result (exit code 1):

```text
Test Files  6 failed (6)
Tests       18 failed | 98 passed (116)
```

The expected failures covered the absent rename parser/processor cases, special invalid-name reason, role-safe projection, `mapVisibleSourceIds` rename, hook defense-in-depth behavior, restricted PLAYER side options, Russian messages, and battle-name editor/read-only UI. The crafted PLAYER registration, unregistration, and rename authorization regressions already passed, confirming the existing default-deny policy without a broad permissions redesign.

### Focused GREEN

The same command was rerun after the minimal implementation:

```powershell
npm.cmd test -- src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts src/owlbear/extensionServices.test.ts src/ui/state/useExtensionState.test.tsx src/ui/pages/ArmiesPage.test.tsx src/ui/pages/BattlesPage.test.tsx
```

Result (exit code 0):

```text
Test Files  6 passed (6)
Tests       116 passed (116)
```

The broader brief gate also passed:

```powershell
npm.cmd test -- src/commands src/owlbear/extensionServices.test.ts src/ui
npm.cmd run typecheck
```

Results (both exit code 0):

```text
Test Files  10 passed (10)
Tests       134 passed (134)

> tsc -b --pretty false
```

## Full-Suite and Additional Verification

The requested single full-suite run:

```powershell
npm.cmd test
```

Result (exit code 0):

```text
Test Files  41 passed (41)
Tests       284 passed (284)
Duration    4.18s
```

Additional checks:

```powershell
npm.cmd run lint
git diff --check
```

Both exited 0. ESLint reported no findings, and the diff check found no whitespace errors (only the repository's normal LF-to-CRLF checkout warnings).

## Self-Review

- Confirmed map visibility and list authorization remain separate: a detected enemy remains in `mapVisibleSourceIds` but is absent from PLAYER `armies` and counters.
- Confirmed multi-side membership returns the union of those sides' armies.
- Confirmed the hook filters only with `memberSideIds`, including when the map-visible set contains an enemy and omits an authorized army.
- Confirmed GM receives all armies and keeps all configured registration-side choices, including sides with no armies.
- Confirmed crafted PLAYER registration and unregistration both return `GM_ONLY` without mutating input state.
- Confirmed GM rename trims and increments battle/scene revisions, PLAYER rename returns `GM_ONLY` without mutation, and an unknown battle returns `BATTLE_NOT_FOUND`.
- Confirmed validation accepts 80 astral Unicode code points, rejects blank and 81-code-point names, preserves `requestId`, and emits `INVALID_BATTLE_NAME`.
- Confirmed the GM save control is disabled for blank, over-80, and unchanged names; submission is trimmed; external name changes reset the draft; PLAYER has no textbox.
- Confirmed the release action remains present for GM and the existing App confirmation path remains unchanged.
- Confirmed no route, overlay reconciler, protocol, version, manifest, or icon work was included. The existing private local-clone helper and local-clone reconciler terminology remain intentionally unchanged.
- Reviewed the complete diff and found no unrelated production changes.

## Concerns

No known functional blockers or scope concerns.
