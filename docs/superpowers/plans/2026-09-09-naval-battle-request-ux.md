# Naval Battle Request UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make naval battle requests visibly pending for faction leaders and clearly actionable for the GM, with one aggregated notification regardless of queue size.

**Architecture:** Reuse the existing authoritative `navalBattleRequests` scene state and current GM request queue. Expose only leader-owned pending requests to player snapshots, propagate them to `FleetPage`, and add one GM summary banner/tab counter in `App`. Keep duplicate prevention in command processing so stale or rapid UI actions cannot create duplicate pair requests.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Owlbear Rodeo extension state/command architecture.

**Spec:** `docs/superpowers/specs/2026-09-09-naval-battle-request-ux-design.md`

## Global Constraints

- Players only request; GM starts the naval battle.
- Multiple requests must never create multiple stacked banners/toasts.
- A leader only sees pending requests initiated by sides they lead.
- Duplicate initiating-ship/target-ship requests are rejected authoritatively.
- Existing tactical naval battle rules are unchanged.

---

### Task 1: Player pending request visibility

**Files:**
- Modify: `src/owlbear/navalBattleRequestSnapshot.test.ts`
- Modify: `src/owlbear/extensionServices.ts`

**Interfaces:**
- Produces: `RawExtensionSnapshot.pendingNavalBattleRequests` for GM and relevant faction leaders.

- [ ] **Step 1: Write the failing snapshot test**

Change the existing leader expectation from an empty list to the leader's own pending request, and add an ordinary-member assertion that remains empty.

- [ ] **Step 2: Run CI and verify RED**

Expected: the leader snapshot still returns `pendingNavalBattleRequests: []`.

- [ ] **Step 3: Implement minimal role-safe filtering**

Map scene requests after resolving the initiating ship and include a request for a player only when `leaderSideIds.has(initiatingShip.sideId)`; GM still receives all requests.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: snapshot tests pass without exposing foreign request state to ordinary members.

---

### Task 2: Player button becomes pending

**Files:**
- Modify: `src/ui/pages/FleetPageNavalRequest.test.tsx`
- Modify: `src/ui/pages/FleetPage.tsx`
- Modify: `src/ui/pages/ForcesPage.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `pendingNavalBattleRequests` from the snapshot.
- Produces: disabled `Запрошено — ожидает ведущего` state for the currently selected ship/target pair.

- [ ] **Step 1: Write failing FleetPage tests**

Render a pending request for the selected pair and assert the request button is disabled and labeled `Запрошено — ожидает ведущего`. Assert a different target pair still shows `Инициировать морской бой`.

- [ ] **Step 2: Verify RED**

Expected: current FleetPage does not accept pending request props or change button state.

- [ ] **Step 3: Propagate pending requests**

Pass `pendingNavalBattleRequests` from `App` through `ForcesPage` into `FleetPage`.

- [ ] **Step 4: Implement pair-aware pending state**

Compute whether a pending request matches `selectedRequestInitiatingShipId` and `selectedRequestTargetShipId`; disable the button and switch its label only for that pair.

- [ ] **Step 5: Verify GREEN**

Expected: FleetPage tests pass and ordinary request creation remains unchanged for non-pending pairs.

---

### Task 3: Authoritative duplicate safety

**Files:**
- Modify: `src/commands/navalBattleRequestCommands.test.ts`
- Modify: `src/commands/commandProcessor.ts`

**Interfaces:**
- Produces rejection reason `NAVAL_BATTLE_REQUEST_ALREADY_PENDING` for duplicate initiating/target pairs.

- [ ] **Step 1: Write failing command test**

Seed `scene.navalBattleRequests` with the same initiating/target pair and execute another valid `REQUEST_NAVAL_BATTLE` command.

- [ ] **Step 2: Verify RED**

Expected: current processor appends a second duplicate request.

- [ ] **Step 3: Add authoritative duplicate guard**

Before creating a request, reject when an existing pending request has the same `initiatingShipId` and `targetShipId`.

- [ ] **Step 4: Verify GREEN**

Expected: duplicate test passes while distinct requests remain allowed.

---

### Task 4: Single aggregated GM notification and tab counter

**Files:**
- Modify: `src/ui/App.test.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: GM `pendingNavalBattleRequests.length`.
- Produces: one banner `Заявки на морской бой: N`, one `Открыть` action, and a `Бои (N)` tab label.

- [ ] **Step 1: Write failing App tests**

For three pending requests, assert exactly one summary banner is rendered, it contains `Заявки на морской бой: 3`, the nav contains `Бои (3)`, and clicking `Открыть` switches to the Battles page. Assert zero requests renders no banner and plain `Бои`.

- [ ] **Step 2: Verify RED**

Expected: current App has no aggregate request banner or count.

- [ ] **Step 3: Implement one in-layout banner**

Render a single summary element only for GM when count > 0. Do not map over requests for notifications. Clicking `Открыть` calls `setGmTab("BATTLES")`.

- [ ] **Step 4: Add tab count**

Render `Бои (${count})` only for the GM when pending count > 0.

- [ ] **Step 5: Verify GREEN**

Expected: multiple requests still produce one banner.

---

### Task 5: Clarify GM start flow

**Files:**
- Modify: `src/ui/pages/BattlesPageNavalRequests.test.tsx`
- Modify: `src/ui/pages/BattlesPage.tsx`

**Interfaces:**
- Produces: explicit numbered flow for each queued request.

- [ ] **Step 1: Write failing UI assertions**

Assert request cards contain `1. Выбрать область боя`, `2. Дополнительные корабли`, and `3. Начать морской бой`; the final action remains disabled until an area draft exists.

- [ ] **Step 2: Verify RED**

Expected: current labels are unnumbered.

- [ ] **Step 3: Update request card copy only**

Keep existing command wiring and validation; change labels/legend so the workflow is self-explanatory.

- [ ] **Step 4: Verify GREEN**

Expected: all existing start-request behavior remains intact.

---

### Task 6: Full verification

**Files:** none beyond prior tasks.

- [ ] **Step 1: Run full CI**

Run the repository workflow equivalent to `npm ci`, `npm audit --audit-level=high`, and `npm run check`.

- [ ] **Step 2: Inspect test/build evidence**

Require typecheck, lint, all Vitest suites, and production build to pass on the final feature-branch head.

- [ ] **Step 3: Review queue behavior**

Confirm from tests/code that N pending requests create exactly one App banner, N queue cards in Battles, and duplicate pair requests cannot accumulate.
