# Faction Military Influence Writeback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the existing Sheets writeback so faction and state army HP are projected into the workbook, and military influence rewards/costs are applied idempotently through `ЛР_ОПЕРАЦИИ`.

**Architecture:** Owlbear remains authoritative for army HP and finalized game outcomes. The writeback projection sends affected faction and state totals keyed by `backendCountry`; Apps Script updates only `AS`, `AN`, `AI`, and approved technical/log columns while preserving derived formulas. Military influence uses an idempotent action under the existing script lock.

**Tech Stack:** TypeScript, Vitest, Google Apps Script, Google Sheets Web App.

**Spec:** `docs/superpowers/specs/2026-10-02-faction-military-influence-writeback-design.md`

## Global Constraints

- Only `ФРАКЦИИ(РАЗРАБОТКА) [1910]`, state HP source `AN`, and `ЛР_ОПЕРАЦИИ` are modified by this feature.
- `backend` is read-only and remains the canonical country index.
- Faction HP is written to `AS`; military influence is written to `AI`; derived formulas remain intact.
- `ЛР_ОПЕРАЦИИ` remains the only operation journal.
- All Apps Script mutations use `LockService.getScriptLock()`.

## Tasks

### Task 1: Projection model

- [x] Add faction and state aggregate snapshots to the writeback event.
- [x] Compute affected totals from authoritative previous/next command states.
- [x] Coalesce totals by faction ID and country.

### Task 2: Influence domain and transport

- [x] Add fixed reason-to-delta rules and validation.
- [x] Add typed client transport for influence batches.
- [ ] Add runtime calls at finalized outcome points.

### Task 3: Apps Script

- [x] Align LR parsing to the live header order.
- [x] Append influence columns without reordering existing columns.
- [x] Bind factions through `BA:BB`.
- [x] Write `AS`, `AN`, and `AI` under the shared script lock.
- [x] Add idempotent influence batches and rollback.

### Task 4: Runtime outcome integration

- [ ] Emit rewards only for finalized land/naval victories, destruction, city defense, and city occupation.
- [ ] Emit costs for ship transfer, upgrades, and commander appointment.
- [ ] Add regression tests for non-rewarding damage and participation.

### Task 5: Verification

- [ ] Run typecheck, lint, complete tests, build, and inspect the final diff.