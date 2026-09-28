# City Army Buildings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement token-created cities, master-managed military/naval buildings, staged army formation and healing with configurable LR costs, railway-anchored supply, and an administrator LR ledger.

**Architecture:** Extend the authoritative scene schema with city buildings, army formation/healing state, configurable LR rates, and append-only LR transactions. Keep rule calculations in focused domain services consumed by the existing command processor and turn checkpoint pipeline; the UI only previews and submits commands. Preserve existing master-only direct registration as a separate path.

**Tech Stack:** TypeScript, React, Vitest, Owlbear SDK adapter, existing scene metadata/migration and command gateway.

**Spec:** `docs/superpowers/specs/2026-09-28-city-army-buildings-design.md`

## Global Constraints

- Army maximum defaults to 40 HP; city-created armies start at 5 HP.
- Formation and healing apply immediately and append a transaction; there is no internal LR balance.
- Formation costs are charged per HP; default formation/healing cost is 5,000 ЛР and hospital healing is 2,500 ЛР.
- Formation limits are 15 HP/turn without a Barracks and 25 HP/turn with an active formation-city Barracks; initial 5 HP counts toward the first-turn limit.
- Healing is capped at 10 HP/turn per army and requires supply, no battle, and no active formation.
- Only the master creates/edits cities and buildings; leaders of the influencing faction and the master use active buildings.
- One building of each type is allowed per city; buildings are free and have no dependency chain.
- Fleet slots are excluded; Aerodrome is registered but inactive.
- Existing direct master registration and HP tools remain unchanged.
- Supply must reach a concrete active railway-station cell; recognized territory alone is not an anchor.

## Review Focus

- Legacy v7 scenes and armies load with empty building/ledger/formation defaults without losing routes, HP, or ownership (Task 1 migration tests).
- A duplicate or retried LR command never applies HP twice or appends a second transaction (Task 3 command idempotency tests).
- A city capture disables every linked building while preserving the records for later reactivation (Task 2 activation tests).
- A railway station outside city territory still anchors supply, while a path ending on recognized territory does not (Task 4 supply tests).
- A port-specific embark/disembark cost of 0 versus 3 army OP is enforced authoritatively, not only in UI (Task 4 transport tests).

---

### Task 1: Authoritative schema, settings, migrations, and LR ledger primitives

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/storage/migrations.ts`
- Create: `src/finance/lrLedger.ts`
- Test: `src/storage/cityArmyBuildingsMigration.test.ts`
- Test: `src/finance/lrLedger.test.ts`

**Interfaces:**
- Produces `CityBuilding`, `CityBuildingType`, `LRTransaction`, configurable LR rates, army formation fields, ship repair fields, and normalized v8 scene state.
- Produces pure ledger helpers for creating, deduplicating, and marking transactions.

- [ ] Write failing migration tests for v7 scenes, old armies, default rates, and round-trip preservation.
- [ ] Run the focused migration tests and verify failure comes from missing schema fields/helpers.
- [ ] Add schema types, defaults, validation, and v7→v8 migration with empty safe defaults.
- [ ] Add pure ledger helpers: immutable append, request-id dedupe, snapshot labels, and `PENDING`/`RECORDED` transitions.
- [ ] Run migration and ledger tests to green; run existing validation/migration tests.
- [ ] Commit `feat: add city army and lr ledger schema`.

### Task 2: City marker and building domain rules

**Files:**
- Modify: `src/cities/strategicCities.ts`
- Modify: `src/cities/strategicCityCommands.ts`
- Create: `src/cities/cityBuildingRules.ts`
- Modify: `src/shared/types.ts` command payloads
- Test: `src/cities/cityBuildingRules.test.ts`
- Test: `src/commands/strategicCityBuildings.test.ts`

**Interfaces:**
- Consumes Task 1 city/building types.
- Produces `isCityBuildingActive(scene, city, building)`, `canUseCityBuilding(...)`, building add/remove validation, and city-token creation/update command payloads.

- [ ] Write failing tests for one-per-type, Canal cell uniqueness, building cells outside city territory, influence ownership, capture deactivation, and selected-token city creation.
- [ ] Run focused tests and verify the expected missing-rule failures.
- [ ] Implement building validation and active-control calculation without dependency chains.
- [ ] Add GM city marker creation/relinking and building add/remove commands; preserve legacy direct city editing.
- [ ] Run focused city/building tests and existing strategic-city tests.
- [ ] Commit `feat: add city building domain rules`.

### Task 3: Army formation, staged costs, configurable healing, and permissions

**Files:**
- Modify: `src/health/armyHealth.ts`
- Modify: `src/commands/commandProcessorCore.ts`
- Modify: `src/commands/commandValidationCore.ts`
- Modify: `src/shared/permissions.ts`
- Modify: `src/turns/turnService.ts`
- Create: `src/armies/armyFormation.ts`
- Test: `src/armies/armyFormation.test.ts`
- Test: `src/commands/cityArmyCommands.test.ts`
- Test: `src/health/armyHealth.test.ts`

**Interfaces:**
- Consumes Task 1 ledger/settings and Task 2 city-building predicates.
- Produces authoritative create/complete/heal commands, formation limits, immediate experience, hospital selection, and per-turn reset behavior.

- [ ] Write failing tests for 5 HP creation, first-turn 5+10/5+20 limits, 5,000 ЛР per HP, configurable rates, hospital 2,500 rate for one army, 10 HP healing cap, and battle interruption.
- [ ] Run focused tests and confirm missing command/state behavior.
- [ ] Implement pure formation/healing calculators and command validation/authorization for influencing leaders and GM.
- [ ] Apply HP and LR ledger entries atomically; dedupe by command request id; keep direct GM registration unchanged.
- [ ] Reset per-turn formation/healing counters and hospital assignment at global-turn transition.
- [ ] Run focused command/health/turn tests and existing command processor tests.
- [ ] Commit `feat: add staged army formation and healing`.

### Task 4: Supply, movement, naval, and building-effect integration

**Files:**
- Modify: `src/supply/supplyService.ts`
- Modify: `src/turns/turnCheckpointPipeline.ts`
- Modify: `src/turns/turnService.ts`
- Modify: `src/naval/transport/transportRules.ts`
- Modify: `src/naval/ships/shipStrategicMovement.ts`
- Modify: `src/owlbear/shipRouteTool.ts`
- Create: `src/cities/cityEffects.ts`
- Test: `src/supply/railwaySupply.test.ts`
- Test: `src/cities/cityEffects.test.ts`
- Test: `src/naval/cityNavalEffects.test.ts`

**Interfaces:**
- Consumes Task 2 active-building predicates and Task 3 army state fields.
- Produces railway-only supply, one-turn city grace, postal/watchtower bonuses, port 0/3 OP transport behavior, shipyard repair, marine-station crossing, canal domains, lighthouse/bunkering bonuses, sea-fort landing denial, and coastal-battery retaliation hooks.

- [ ] Write failing tests for railway endpoint supply, foreign logistics access, one-turn grace, local Postal Station, Port 0/3 OP, 10 HP shipyard repair, and each naval/shore building effect.
- [ ] Run focused tests and verify failures are feature-related.
- [ ] Implement pure city effect calculations and connect them to authoritative movement, transport, ship turn reset, visibility, and naval command paths.
- [ ] Remove recognized-territory supply fallback while preserving embarked-army supply behavior.
- [ ] Run focused supply/naval tests and all existing movement/transport/naval tests.
- [ ] Commit `feat: apply city effects to strategic mechanics`.

### Task 5: Background persistence, selected-token flows, and role-safe snapshots

**Files:**
- Modify: `src/background/applicationCore.ts`
- Modify: `src/owlbear/extensionServicesCore.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/ui/state/useExtensionState.ts`
- Test: `src/background/cityArmyPersistenceIntegration.test.ts`
- Test: `src/owlbear/cityRegistrationIntegration.test.ts`

**Interfaces:**
- Consumes all prior authoritative commands and view models.
- Produces selected-token city/army/building flows, persistence of marker/building metadata, role-safe city/army/building/ledger snapshots, and transaction acknowledgements.

- [ ] Write failing integration tests for selected-token city creation, selected-token city army creation, persistence/reload, and role filtering.
- [ ] Run focused integration tests to verify missing flow wiring.
- [ ] Wire command envelopes, scene writes, Owlbear token metadata, revision conflicts, and background acknowledgements.
- [ ] Build role-safe views: leaders see their faction actions, master sees all cities/buildings/ledger, other players see neither transaction data nor unauthorized controls.
- [ ] Run integration tests and existing background/Owlbear persistence tests.
- [ ] Commit `feat: wire city and army flows through background runtime`.

### Task 6: UI for cities, army lifecycle, buildings, settings, and LR ledger

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/ui/pages/ArmiesPage.tsx`
- Modify: `src/ui/pages/ManagementPage.tsx`
- Modify: `src/ui/components/StrategicCityEditor.tsx`
- Modify: `src/ui/components/ArmyCard.tsx`
- Modify: `src/ui/app.css`
- Test: `src/ui/pages/ArmiesPageCityActions.test.tsx`
- Test: `src/ui/components/StrategicCityBuildings.test.tsx`
- Test: `src/ui/pages/ManagementPageLedger.test.tsx`

**Interfaces:**
- Consumes Task 5 role-safe view models and command callbacks.
- Produces player city creation/formation/healing controls, master city/building editor, configurable LR settings, pending/history ledger, TSV copy, and precise Russian error messages.

- [ ] Write failing component tests for leader-only city army controls, staged cost previews, hospital discount, master building add/remove, inactive-on-capture display, rate editing, ledger filters, and copy action.
- [ ] Run focused UI tests and verify missing controls.
- [ ] Implement controls and role-safe rendering without duplicating authoritative rules.
- [ ] Add local optimistic-free command feedback and refresh-on-ack behavior.
- [ ] Run focused UI tests and existing UI suite.
- [ ] Commit `feat: add city army and lr management ui`.

### Task 7: Documentation, full verification, and final review

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-28-city-army-buildings-design.md` only if implementation discovers a necessary ruling
- Test: all project tests/build checks

- [ ] Add concise player/master usage documentation for city tokens, formation, healing, buildings, railway supply, and the LR ledger.
- [ ] Run `npm.cmd test` and read the complete result.
- [ ] Run `npm.cmd run typecheck` and `npm.cmd run lint`.
- [ ] Run `npm.cmd run build` and read the complete result.
- [ ] Perform the required fresh whole-branch review against the plan and spec; fix Critical/Important findings with RED→GREEN tests.
- [ ] Commit `docs: document city army and lr workflows`.
