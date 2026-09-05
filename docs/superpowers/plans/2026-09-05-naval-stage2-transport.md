# Naval Stage 2 Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative troop embarkation/disembarkation, transport movement coupling, destruction coupling, and UI controls without changing Stage 1 naval battle behavior.

**Architecture:** Keep transport rules in a focused `src/naval/transport` domain module. Commands mutate reciprocal army/ship metadata through `CommandProcessor`; Owlbear/background integration supplies authoritative current strategic cells and persists visibility changes. Existing land BattleGroup code handles hostile landing collisions.

**Tech Stack:** TypeScript, Vitest, React, Owlbear Rodeo SDK.

**Spec:** `docs/superpowers/specs/2026-09-05-naval-stage2-design.md`

## Global Constraints

- Embark/disembark only in `MOVEMENT`.
- `TRANSPORT` only; one army per transport, one transport per army.
- Orthogonal adjacency or same mixed LAND+SEA cell.
- Operation ends transport global movement.
- Reciprocal linkage is authoritative.
- Foreign army requires consent from both sides; no transport ownership transfer.
- No ship-to-ship army transfer.
- Destroyed transport destroys embarked army.
- Friendly occupied landing forbidden; enemy occupied landing creates/joins normal land battle.

---

### Task 1: Pure transport geometry and state rules

**Files:**
- Create: `src/naval/transport/transportRules.ts`
- Test: `src/naval/transport/transportRules.test.ts`

**Interfaces:**
- Produces `validateTransportInteraction(...)`, `embarkArmy(...)`, `disembarkArmy(...)`, and `isReciprocallyEmbarked(...)` for command/runtime layers.

- [ ] Write failing tests for class, phase, occupancy/linking, orthogonal adjacency, mixed-domain same-cell, movement consumption, and reciprocal linking.
- [ ] Run focused tests and verify RED.
- [ ] Implement minimal pure rules.
- [ ] Run focused tests and verify GREEN.
- [ ] Commit.

### Task 2: Command protocol and authorization

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/permissions.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandProcessor.ts`
- Test: `src/commands/transportCommands.test.ts`

**Interfaces:**
- Add `EMBARK_ARMY`, `ACCEPT_EMBARK_ARMY`, and `DISEMBARK_ARMY` command payloads with explicit consent state for cross-faction transport.

- [ ] Write failing command/auth tests.
- [ ] Verify RED.
- [ ] Implement protocol/parser/authorization and reciprocal state mutation.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 3: Position-aware runtime and landing collisions

**Files:**
- Modify: `src/background/application.ts`
- Add: `src/background/transportPersistenceIntegration.test.ts`

**Interfaces:**
- Supplies authoritative army/ship strategic cells to the transport command path and persists token visibility/state.
- Reuses existing `BattleGroup` creation when hostile disembarkation lands on an enemy army.

- [ ] Write failing integration tests for adjacency, mixed-domain same-cell, friendly-blocked landing, hostile landing battle, and persistence.
- [ ] Verify RED.
- [ ] Implement runtime preflight/persistence.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 4: Destruction coupling and turn behavior

**Files:**
- Modify: `src/commands/commandProcessor.ts`
- Modify: `src/naval/ships/shipLifecycle.ts` only if lifecycle helper ownership is clearer there.
- Test: `src/naval/transport/transportDestruction.test.ts`

**Interfaces:**
- Any authoritative path that reduces/removes a transport at zero HP also destroys the reciprocally embarked army.

- [ ] Write failing tests for HP-to-zero and unregister/removal paths.
- [ ] Verify RED.
- [ ] Implement minimal destruction coupling and stale-link safety.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 5: Fleet/army UI and role-safe snapshots

**Files:**
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/ui/components/ShipCard.tsx`
- Modify: `src/ui/components/ArmyCard.tsx`
- Test: `src/ui/components/ShipCardTransport.test.tsx`
- Test: `src/owlbear/transportSnapshot.test.ts`

**Interfaces:**
- Transport owners can initiate/accept permitted embark flows; embarked army is represented as cargo while its map token is hidden.

- [ ] Write failing UI/privacy tests.
- [ ] Verify RED.
- [ ] Implement minimal controls and snapshot fields.
- [ ] Verify GREEN.
- [ ] Commit.

### Task 6: Final transport verification

**Files:**
- Modify: `docs/manual-four-client-test.md`

- [ ] Add manual GM/A/B transport and landing scenario.
- [ ] Run exact final `npm run check` through CI.
- [ ] Confirm no Stage 1 regressions.
- [ ] Fast-forward verified transport slice before starting shore bombardment.
