# LR V2 — rollout and verification

**Do not merge the Owlbear branch before the Apps Script migration is complete.** This change is staged in a draft PR and does not modify the live Google Sheet or live web app.

## Invariants

- Existing `backend!C` population is never debited by FORMATION, COMPLETION or HEALING.
- Population growth runs in a separate Apps Script project. `ScriptLock` does not coordinate across projects, but LR V2 never writes `backend!C` (single population writer remains the existing growth job). Formulas calculate available LR directly from the latest population plus permanent spend ledger.
- Permanent spend is the sum of `ЛР_ОПЕРАЦИИ` rows with `operationType = LR`, `reasonCode = LR_V2`, `status = APPLIED`.
- Old expense records (even old `APPLIED` records) do not enter that sum. No backdated population correction.
- Original AO potential-LR formula is preserved *verbatim* in each country's AW cell, and visible AO becomes `MAX(0; AW - LR_V2 expenses)`.
- An army lost or disbanded does not refund an expense.
- Daily sheet check runs around 01:00 `Europe/Moscow`; the Owlbear GM also retries full state synchronization after 01:00 if the previous attempt was missed. No browser-free read of private Owlbear ship/army state is possible.

## Live deployment (maintenance window)

1. A fresh **spreadsheet-only** backup was saved on 2026-10-08: [pre-migration backup](https://docs.google.com/spreadsheets/d/1VerjYl4zaWF0MuyN6fvDTpDohBavW8Y2CXDZVtql1qQ/edit). Independently export/back up the **entire Apps Script project** (the spreadsheet copy alone does not guarantee a separate copy of the script's deployed code, script properties, or triggers).
2. Temporarily block new army creation/healing while changing the web app.
3. **Replace**, do not duplicate, the Apps Script file implementing `doPost` with `apps-script/LetopisSheetWriteback.gs` from this branch in the **existing writeback Apps Script project**. The population-growth project is separate and must remain untouched.
4. Save, deploy a **new version** of the bound Apps Script Web App as the spreadsheet owner, keeping its existing Web App URL and `API_TOKEN` Script Property.
5. Run `installLrV2Formulas()` once from the Apps Script editor, and check that `LR_V2_ENABLED=true` is set only after every formula succeeds. The installer preflights all 24 countries, refuses occupied AW cells, verifies exact ledger subtraction, and attempts to roll back changed formulas on errors. It is idempotent; abort on `LR_V2_CAPACITY_CONFLICT` or another error and inspect the backup before proceeding.
6. Run `installDailySheetSyncTrigger()` once from the writeback editor and authorize time-driven triggers. The independent population-growth script and its trigger remain untouched.
7. Check `ГОСУДАРСТВА [1910]!AO` is available LR, `AW` is unchanged original potential LR, and a test `GET_STATES` response contains distinct `humanResource` and `humanResourceCapacity`.
8. Merge the corresponding Owlbear PR and allow its normal GitHub Pages deployment. Reopen the Owlbear GM client and verify daily-sync metadata, faction/state HP, and backend!H ship counts. Resume army actions.
9. Run one authorized small new LR_V2 army/spend operation; check the population has **not** changed, the ledger gained exactly one `LR_V2` row and AO decreased by exactly `amount` (in thousands). A retry with identical `requestId` must not double-charge.

## Troubleshooting

- `LR_V2_NOT_ENABLED`: the formula migration was not successfully completed; keep spending disabled.
- `LR_V2_CAPACITY_CONFLICT`: the AW helper column has existing content that conflicts with the original AO formula; stop rather than overwrite.
- `LR_V2_MIGRATED_FORMULA_INVALID`: check that the spreadsheet locale uses semicolon formula separators, the journal header columns correspond to I (amount), C (country), V (status), W (operationType), AC (reasonCode), and that AW contains a valid copied potential-LR formula.
- A missing GM or closed Owlbear tab does not roll back daily Sheets checks, but full HP and ship synchronization is deferred until an active GM-connection becomes coordinator.
- Never re-run a legacy population-spend routine or manually delete LR_V2 ledger rows to "refund" armies.

## Staging verification

A separate staging copy of the worksheet was used to test United Kingdom (47,142 thousand population) with an old-style expense already present:

- Original capacity 590.733789 thousand and available 590.733789 thousand: old expense not counted.
- Add 250 thousand new LR_V2 expense: available 340.733789 thousand while population stays 47,142 thousand.
- Switch recruitment law to demilitarization: capacity and available become 0.
- Restore urgent conscription: capacity returns to 590.733789, available returns to 340.733789; permanent 250 expense remains.

The live spreadsheet was not changed in this staged validation.
