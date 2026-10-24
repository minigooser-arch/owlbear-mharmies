# Live LR writeback repair

**Goal:** Make the deployed Apps Script, the spreadsheet formulas, and the Owlbear client use one permanent LR ledger without debiting population.

**Architecture:** `ГОСУДАРСТВА!AW` holds the formula-based recruitment capacity; `AO` subtracts only confirmed `LR_V2` operations. Apps Script reads AO/AW, validates a whole spend batch under `ScriptLock`, and appends each new debit once. The browser uses those snapshots as the authoritative balance.

## Tasks

- [ ] Preserve the existing web-app token property name and read the state's actual name column in the repository Apps Script.
- [ ] Compare the live project's code and deployment with the repository code; preserve existing script properties, deployment URL, and unrelated jobs.
- [ ] Confirm the 24 mapped AO/AW formulas and ledger schema before deployment; avoid reclassifying historic rows.
- [ ] Replace the live writeback code and update its existing deployment to a new version.
- [ ] Verify read-only state snapshots and the live spreadsheet values for Greece, Germany, and the other mapped countries.
- [ ] Reconcile historic population debits only where an authoritative baseline permits exact restoration; otherwise document the unresolved balance rather than guessing.
- [ ] Review the final repository diff and deployment state.

## Constraints

- Do not expose or rotate the existing secret.
- Do not write per-army HP or ship state into public player sheets.
- Do not modify unrelated sheets or the separate population-growth project.
- Do not relabel legacy population-debit operations as `LR_V2`.

