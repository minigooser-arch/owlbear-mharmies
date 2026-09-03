# Naval Strategic Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the missing naval schema layer and add deterministic strategic ship route planning over SEA/CANAL cells with global movement-point spending.

**Architecture:** Keep naval state in the existing shared scene schema, but isolate ship rules under `src/naval/ships`. Terrain remains the single source of truth for LAND/SEA/CANAL movement domains. Strategic ship movement is implemented as pure functions so Owlbear integration can consume a validated plan without duplicating rules.

**Tech Stack:** TypeScript 6, Vitest, Owlbear Rodeo SDK 3.1.0.

**Spec:** Approved naval design from the prior implementation session; current branch tests in `src/storage/navalMigrations.test.ts`, `src/terrain/movementDomains.test.ts`, and `src/naval/ships/*.test.ts` are the executable contract.

## Global Constraints

- Existing land-army behavior must remain backward compatible.
- Legacy terrain migrates to LAND and blocks naval LOS by default.
- CANAL is represented as terrain supporting both LAND and SEA.
- Ship classes keep their canonical movement values from `shipClasses.ts`.
- No wreck token is created when a ship is destroyed.
- Strategic ship routes may enter SEA-capable cells only; LAND-only cells are invalid.
- One entered strategic cell spends one global ship movement point.
- Planning a route must not rotate the ship; facing changes only through explicit rotation logic.

---

### Task 1: Restore naval schema and migrations

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/storage/migrations.ts`
- Test: `src/storage/navalMigrations.test.ts`
- Test: `src/terrain/movementDomains.test.ts`
- Test: `src/naval/ships/shipLifecycle.test.ts`

**Interfaces:**
- Produces `SceneState.version = 6`, `ArmyState.version = 4`, `MovementDomain`, `ShipState`, naval battle storage types, terrain domain fields, and `TurnState.phase`.
- Existing migration tests remain the RED contract.

- [ ] Restore shared naval types required by already-committed naval production files.
- [ ] Add naval-safe defaults to constants.
- [ ] Migrate v5 scenes to v6 and v3 armies to v4.
- [ ] Update normalizers to preserve valid v6/v4 data.
- [ ] Run `npm run check` and fix only failures caused by this schema restoration.
- [ ] Commit as `fix: restore naval schema layer`.

### Task 2: Add strategic ship route core

**Files:**
- Create: `src/naval/ships/shipStrategicMovement.test.ts`
- Create: `src/naval/ships/shipStrategicMovement.ts`

**Interfaces:**
- Produces `planShipStrategicRoute(scene, ship, startCell, cells)`.
- Produces `commitShipStrategicRoute(ship, cells)`.
- Consumes `cellSupportsDomain(..., "SEA")`.

- [ ] Write tests that accept SEA and CANAL, reject LAND-only and diagonal movement, enforce remaining global movement points, and preserve facing.
- [ ] Verify the tests fail before implementation.
- [ ] Implement the minimal pure route planner and commit helper.
- [ ] Run the focused tests and `npm run check`.
- [ ] Commit as `feat: add strategic ship movement core`.

### Task 3: Verify branch integrity

**Files:**
- No new production files unless verification exposes a directly related defect.

- [ ] Run all tests.
- [ ] Run typecheck, lint, and build through `npm run check`.
- [ ] Confirm land-army tests remain green.
- [ ] Confirm naval migration, terrain-domain, ship-class, ship-rotation, lifecycle, and strategic-movement tests are green.
