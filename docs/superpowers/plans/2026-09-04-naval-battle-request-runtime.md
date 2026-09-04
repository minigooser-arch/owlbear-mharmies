# Naval Battle Request Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved leader-request half of the naval battle flow so a faction leader can request a naval battle against a currently detected ship, the request persists without auto-starting, GM can later start from it only after authoritative revalidation, and unplayed requests disappear at the next global turn.

**Architecture:** Keep request eligibility and revalidation pure under `src/naval/battle/navalBattleRequest.ts`. The command protocol will persist requests through the existing authoritative coordinator, while `ProductionEngine` supplies current detection from the same authoritative detection graph already used for map visibility. Battle start remains GM-only and continues to use `startNavalBattle()` for consumption; request creation never starts combat by itself.

**Tech Stack:** TypeScript 6, Vitest 4, React 19, Owlbear Rodeo SDK 3.1.0.

**Spec:** Approved naval rules from the September 2–3 design: leaders submit «Инициировать морской бой» after global movement against detected targets; only GM starts a battle; one battle can be active; pending requests never auto-start; request validity is rechecked before a later start; unplayed requests are removed when the next global turn begins and never block turn progression.

## Global Constraints

- `START_NAVAL_BATTLE` stays GM-only.
- A player may create a request only through a ship whose side they lead.
- Request eligibility is based on authoritative current detection, never on caller-supplied visibility.
- Creating a request does not start a battle or change turn phase.
- A request may wait while another battle is active; after that battle ends it must still pass existence/alive/detection validation before GM can start it.
- Requests not played during their originating global turn are removed at the next turn boundary.
- Pending requests do not prevent `completeTurn()`.
- No Stage 2 behavior is introduced: no embark/disembark, hospital action, shore bombardment, interception/temp-HP changes, or transport coupling.
- Existing manual GM battle-start compatibility is not removed in this slice; the request-backed path is strengthened without inventing a new prohibition that was not explicitly encoded in the current protocol.

---

## File Structure

- Create `src/naval/battle/navalBattleRequest.ts`: pure request creation/revalidation rules.
- Create `src/naval/battle/navalBattleRequest.test.ts`: unit tests for the pure rules.
- Create `src/commands/navalBattleRequestCommands.test.ts`: protocol, authorization, persistence, and no-auto-start tests.
- Modify `src/shared/types.ts`: add `REQUEST_NAVAL_BATTLE` payload.
- Modify `src/commands/commandValidation.ts`: parse the new payload.
- Modify `src/shared/permissions.ts`: allow leaders of the initiating ship side, reject other players.
- Modify `src/commands/commandProcessor.ts`: persist the request using the envelope `requestId` as the request id; never start battle here.
- Create `src/background/navalBattleRequestPersistenceIntegration.test.ts`: authoritative detection integration and persistence tests.
- Modify `src/background/application.ts`: build authoritative detection before accepting request and before request-backed GM start.
- Modify `src/turns/turnService.ts`: drop old `navalBattleRequests` on new global turn.
- Extend `src/turns/turnService.test.ts` or add `src/turns/navalBattleRequestExpiry.test.ts`: prove turn completion clears pending requests without being blocked.
- Modify role-safe snapshot/UI files only after core/runtime is green so leaders can actually submit and GM can inspect pending requests.

### Task 1: Pure request rules

**Files:**
- Create: `src/naval/battle/navalBattleRequest.test.ts`
- Create: `src/naval/battle/navalBattleRequest.ts`

**Interfaces:**
- Produces `createNavalBattleRequest(input)` and `validateNavalBattleRequest(input)`.
- Consumes `NavalSceneState`, `NavalBattleRequest`, and an authoritative `ReadonlySet<string>` of target ship ids currently detected by the initiating side.

- [ ] **Step 1: Write the failing unit tests**

```ts
import { expect, it } from "vitest";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { createNavalBattleRequest, validateNavalBattleRequest } from "./navalBattleRequest";

function sceneFixture(): NavalSceneState {
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [], states: [], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },
    ships: {
      red: createRegisteredShip("red-side", "CRUISER", "EAST"),
      blue: createRegisteredShip("blue-side", "BATTLESHIP", "WEST")
    },
    navalBattleRequests: [], activeNavalBattle: null, navalBattleHistory: [], navalRevealUntilTurn: {}
  };
}

it("creates a pending request for a currently detected living target without starting battle", () => {
  const result = createNavalBattleRequest({
    scene: sceneFixture(), requestId: "req-1", initiatingShipId: "red", targetShipId: "blue",
    detectedTargetShipIds: new Set(["blue"])
  });
  expect(result).toEqual({ ok: true, request: { id: "req-1", initiatingShipId: "red", targetShipId: "blue", createdOnTurn: 7 } });
});

it("rejects a target that is no longer detected", () => {
  const result = createNavalBattleRequest({
    scene: sceneFixture(), requestId: "req-1", initiatingShipId: "red", targetShipId: "blue",
    detectedTargetShipIds: new Set()
  });
  expect(result).toEqual({ ok: false, reason: "TARGET_NOT_DETECTED" });
});

it("revalidates existence, hp and detection before a pending request is used", () => {
  const scene = sceneFixture();
  const request = { id: "req-1", initiatingShipId: "red", targetShipId: "blue", createdOnTurn: 7 };
  scene.ships.blue.hp = 0;
  expect(validateNavalBattleRequest({ scene, request, detectedTargetShipIds: new Set(["blue"]) }))
    .toEqual({ ok: false, reason: "TARGET_SHIP_DESTROYED" });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/naval/battle/navalBattleRequest.test.ts`

Expected: FAIL because `./navalBattleRequest` does not exist yet.

- [ ] **Step 3: Implement the minimal pure module**

```ts
import type { NavalBattleRequest, NavalSceneState } from "../../shared/types";

export type NavalBattleRequestFailure =
  | "INITIATING_SHIP_NOT_FOUND"
  | "TARGET_SHIP_NOT_FOUND"
  | "INITIATING_SHIP_DESTROYED"
  | "TARGET_SHIP_DESTROYED"
  | "TARGET_NOT_DETECTED";

export interface NavalBattleRequestValidationInput {
  scene: Pick<NavalSceneState, "ships" | "turn">;
  request: NavalBattleRequest;
  detectedTargetShipIds: ReadonlySet<string>;
}

export function validateNavalBattleRequest(input: NavalBattleRequestValidationInput) {
  const initiating = input.scene.ships[input.request.initiatingShipId];
  if (!initiating) return { ok: false as const, reason: "INITIATING_SHIP_NOT_FOUND" as const };
  const target = input.scene.ships[input.request.targetShipId];
  if (!target) return { ok: false as const, reason: "TARGET_SHIP_NOT_FOUND" as const };
  if (initiating.hp <= 0) return { ok: false as const, reason: "INITIATING_SHIP_DESTROYED" as const };
  if (target.hp <= 0) return { ok: false as const, reason: "TARGET_SHIP_DESTROYED" as const };
  if (!input.detectedTargetShipIds.has(input.request.targetShipId)) {
    return { ok: false as const, reason: "TARGET_NOT_DETECTED" as const };
  }
  return { ok: true as const };
}

export function createNavalBattleRequest(input: {
  scene: Pick<NavalSceneState, "ships" | "turn">;
  requestId: string;
  initiatingShipId: string;
  targetShipId: string;
  detectedTargetShipIds: ReadonlySet<string>;
}) {
  const request: NavalBattleRequest = {
    id: input.requestId,
    initiatingShipId: input.initiatingShipId,
    targetShipId: input.targetShipId,
    createdOnTurn: input.scene.turn.turnNumber
  };
  const validation = validateNavalBattleRequest({
    scene: input.scene,
    request,
    detectedTargetShipIds: input.detectedTargetShipIds
  });
  return validation.ok ? { ok: true as const, request } : validation;
}
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `npx vitest run src/naval/battle/navalBattleRequest.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/naval/battle/navalBattleRequest.ts src/naval/battle/navalBattleRequest.test.ts
git commit -m "feat: define naval battle request rules"
```

### Task 2: Protocol and authorization

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/shared/permissions.ts`
- Modify: `src/commands/commandProcessor.ts`
- Create: `src/commands/navalBattleRequestCommands.test.ts`

**Interfaces:**
- New payload: `{ type: "REQUEST_NAVAL_BATTLE"; initiatingShipId: string; targetShipId: string }`.
- `requestId` from the command envelope becomes persisted `NavalBattleRequest.id`.
- CommandProcessor receives an injected synchronous `canRequestNavalBattle(initiatingShipId, targetShipId): boolean` or authoritative detected-target set prepared by the runtime; it must not trust a boolean sent by the player.

- [ ] **Step 1: RED tests**

Prove all of the following in `navalBattleRequestCommands.test.ts`:
- leader of initiating ship side is authorized;
- ordinary member and leader of another side get `NOT_SIDE_LEADER`;
- malformed ids are rejected by command validation;
- accepted command appends exactly one pending request with `createdOnTurn` equal to the current turn;
- active battle remains unchanged and phase remains unchanged;
- undetected target produces stable rejection `TARGET_NOT_DETECTED`.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/commands/navalBattleRequestCommands.test.ts`

Expected: FAIL because `REQUEST_NAVAL_BATTLE` is not in the protocol.

- [ ] **Step 3: Minimal implementation**

Add the payload to `ArmyCommandPayload`, parser to `PAYLOAD_PARSERS`, leader authorization through `ledBy(context, initiatingShip.sideId)`, and one `CommandProcessor` case that calls `createNavalBattleRequest()` and appends only the returned request.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/commands/navalBattleRequestCommands.test.ts src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/commands/commandValidation.ts src/shared/permissions.ts src/commands/commandProcessor.ts src/commands/navalBattleRequestCommands.test.ts
git commit -m "feat: add leader naval battle requests"
```

### Task 3: Authoritative detection at request/start time

**Files:**
- Modify: `src/background/application.ts`
- Create: `src/background/navalBattleRequestPersistenceIntegration.test.ts`

**Interfaces:**
- Reuse the same detection source used by `visibilityTick`: current source-token positions, `scene.settings.detectionMode`, per-unit detection ranges, and current vision barriers.
- For request creation, derive detected target ids for the initiating side before CommandProcessor acceptance.
- For request-backed `START_NAVAL_BATTLE`, load the referenced request and repeat existence/alive/detection validation immediately before start.

- [ ] **Step 1: RED integration tests**

Test with the in-memory Owlbear adapter that:
- visible detected target persists request and returns `ACCEPTED`;
- moving/removing/blocking visibility of the target before request returns `TARGET_NOT_DETECTED`;
- a stored pending request whose target becomes undetected cannot be used by GM until detection is restored;
- battle start still remains GM-only.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/background/navalBattleRequestPersistenceIntegration.test.ts`

Expected: FAIL because ProductionEngine does not provide authoritative request detection yet.

- [ ] **Step 3: Implement runtime validation**

Build the detection graph from current authoritative records exactly as `visibilityTick` does. Pass only the derived detection result into the request command path. When `START_NAVAL_BATTLE.navalRequestId` references a stored request, revalidate that request immediately before starting; do not auto-start any request.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/background/navalBattleRequestPersistenceIntegration.test.ts src/background/navalBattleStartPersistenceIntegration.test.ts src/background/crossDomainVisibilityIntegration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/application.ts src/background/navalBattleRequestPersistenceIntegration.test.ts
git commit -m "feat: validate naval requests against live detection"
```

### Task 4: Global-turn expiry

**Files:**
- Modify: `src/turns/turnService.ts`
- Create: `src/turns/navalBattleRequestExpiry.test.ts`

**Interfaces:**
- `completeTurn()` always advances normally.
- Its returned scene has `navalBattleRequests: []` for the new turn.

- [ ] **Step 1: RED test**

Create a turn fixture with one pending naval request; call `completeTurn()` and assert `changed === true`, turn increments, and returned `scene.navalBattleRequests` is empty.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/turns/navalBattleRequestExpiry.test.ts`

Expected: FAIL because current `completeTurn()` preserves pending requests.

- [ ] **Step 3: Minimal implementation**

After cloning the scene and before returning the new-turn state, set:

```ts
nextScene.navalBattleRequests = [];
```

Do not gate turn completion on pending requests.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/turns/navalBattleRequestExpiry.test.ts src/turns/turnService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/turns/turnService.ts src/turns/navalBattleRequestExpiry.test.ts
git commit -m "fix: expire naval requests on new turn"
```

### Task 5: Leader and GM UI

**Files:**
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/ui/pages/FleetPage.tsx`
- Modify: `src/ui/pages/ShipCard.tsx` if target controls live there
- Modify: `src/ui/pages/BattlesPage.tsx`
- Add focused UI tests adjacent to those components.

**Interfaces:**
- Leader UI can reference currently map-visible enemy ships without exposing hidden ships.
- Leader chooses one controlled initiating ship and one detected target, then sends `REQUEST_NAVAL_BATTLE`.
- GM Battles page lists pending requests and starts a selected request through existing `START_NAVAL_BATTLE` preparation flow.

- [ ] **Step 1: RED UI tests**

Prove hidden enemy ships never appear as request targets, detected enemy ships can be selected, non-leaders do not see request controls, pending requests are GM-visible, and clicking request only sends `REQUEST_NAVAL_BATTLE` rather than starting combat.

- [ ] **Step 2: Verify RED**

Run the focused Fleet/Battles UI tests.

Expected: FAIL because request UI does not exist.

- [ ] **Step 3: Implement minimal UI**

Expose only the data required for request controls; do not broaden player snapshots to leak hidden enemy ship details. Reuse `mapVisibleSourceIds` as the client-side display eligibility signal, while server-side detection remains authoritative.

- [ ] **Step 4: Verify GREEN**

Run focused UI tests and existing `BattlesPageNaval`/`FleetPage` tests.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/owlbear/extensionServices.ts src/ui/state/useExtensionState.ts src/ui/pages/FleetPage.tsx src/ui/pages/ShipCard.tsx src/ui/pages/BattlesPage.tsx src/ui/**/*.test.tsx
git commit -m "feat: expose naval battle request workflow"
```

### Task 6: Full Stage 1 verification for this slice

- [ ] **Step 1: Run full repository verification**

Run: `npm run check`

Expected: typecheck, lint, all Vitest tests, and Vite production build all exit 0.

- [ ] **Step 2: Update manual Owlbear test documentation**

Add a naval request scenario covering two leaders plus GM: target hidden → no request target; target detected → request can be submitted; request does not auto-start; GM starts it; queued request revalidates after current battle; advancing global turn removes unplayed requests.

- [ ] **Step 3: Commit verification documentation**

```bash
git add docs/manual-four-client-test.md docs/superpowers/plans/2026-09-04-naval-battle-request-runtime.md
git commit -m "docs: add naval request verification flow"
```
