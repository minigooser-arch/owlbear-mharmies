# Population Google Sheets Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the GM synchronize state population and growth factors from the public `backend` tab of the configured Google Sheet using an explicit button, while keeping human-resource spending and all writes inside the extension.

**Architecture:** Store a stable `backend.country` mapping on each state and a configurable public CSV URL in scene settings. A small pure parser converts the public CSV into normalized rows; the GM-only UI matches rows to states and sends ordinary audited demographic correction commands, so no new server or write access to Google is required.

**Tech Stack:** TypeScript, React, Vitest, existing Owlbear command and scene settings pipeline.

**Spec:** User-approved direct read-only integration with public Google Sheet `backend` tab; state IDs will be mapped to `backend.country` values by the GM.

## Global Constraints

- Google Sheets is read-only from the extension; the extension must never write to the spreadsheet.
- Synchronization is explicit and GM-only; no background polling.
- Population and `growth_rate` are imported; current in-scene LR is preserved because the source tab has no LR column.
- Every imported change uses the existing demographic audit and correction rules.
- Unmatched or malformed rows must be reported without mutating unrelated states.

## Review Focus

- Quoted CSV fields and comma decimal formatting must parse without corrupting rows.
- Missing `backend.country` mapping must be reported and skipped.
- A source row with no population or invalid growth must not overwrite scene data.
- Import must preserve human resource, conscription law, and audit existing command semantics.
- Network failure or non-2xx response must leave the scene unchanged and show a useful error.

---

### Task 1: Add source mapping and configuration fields

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/commands/commandValidationCore.ts`
- Modify: `src/ui/pages/StatesPage.tsx`
- Modify: `src/ui/pages/SettingsPage.tsx`
- Test: `src/storage/migrations.test.ts`, `src/ui/pages/StatesPage.test.tsx`

**Interfaces:**
- `StateEntity.backendCountry?: string | null`
- `SceneSettings.populationSheetCsvUrl?: string`

- [ ] Write failing tests for state mapping round-trip and URL validation/default.
- [ ] Run the focused tests and confirm the new fields are missing.
- [ ] Add optional fields with backward-compatible defaults and GM editors.
- [ ] Run focused tests and typecheck.

### Task 2: Implement and test the public CSV parser

**Files:**
- Create: `src/population/googleSheetsPopulation.ts`
- Test: `src/population/googleSheetsPopulation.test.ts`

**Interfaces:**
- `parseBackendPopulationCsv(csv: string): BackendPopulationRow[]`
- `normalizeBackendPopulationRow(row): BackendPopulationRow | undefined`

- [ ] Write failing tests for header lookup, quoted fields, comma decimals, blank UUIDs, and invalid rows.
- [ ] Run the parser tests and confirm failure.
- [ ] Implement a dependency-free CSV parser using the header names `country`, `population`, `growth_rate`.
- [ ] Run parser tests and typecheck.

### Task 3: Build the GM synchronization flow

**Files:**
- Create: `src/population/populationSheetSync.ts`
- Modify: `src/ui/pages/PopulationPage.tsx`
- Modify: `src/ui/pages/ManagementPage.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/population/populationSheetSync.test.ts`, `src/ui/pages/PopulationPage.test.tsx`

**Interfaces:**
- `syncPopulationFromPublicSheet(input): Promise<PopulationSyncSummary>`
- `PopulationSyncSummary` reports applied, skipped, unmatched, and errors.

- [ ] Write failing tests for matched mappings, skipped unmapped states, preservation of current LR, and fetch failure.
- [ ] Run tests and confirm failure.
- [ ] Implement read-only fetch of the configured CSV URL and produce ordinary `UPDATE_STATE_DEMOGRAPHY` commands with reason `Импорт из Google Sheets`.
- [ ] Add a GM-only button and result summary; disable it while syncing.
- [ ] Run focused UI and sync tests.

### Task 4: Verification and documentation

**Files:**
- Modify: `docs/global-map-player-guide.md` or the relevant GM guide.

- [ ] Run the full Vitest suite, typecheck, lint, and build.
- [ ] Verify the CSV URL for gid `64907648` returns the expected `backend` headers.
- [ ] Document mapping procedure and explain that LR remains in-scene/manual.
- [ ] Review the diff for accidental writes to Google Sheets or polling.

