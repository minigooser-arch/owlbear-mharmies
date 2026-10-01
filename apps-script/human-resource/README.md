# Google Sheets human-resource gateway

This Apps Script project is the authoritative gateway for population and human-resource operations used by the Owlbear armies extension.

## Spreadsheet

The script uses:

- `backend!A` — stable country key.
- `backend!C` — population, in thousands of people.
- `backend!K` — daily population growth factor.
- `ГОСУДАРСТВА [1910]!P` — population projection used by the state sheet.
- `ГОСУДАРСТВА [1910]!AO` — current human resource, in thousands of people.
- `ГОСУДАРСТВА [1910]!AO` on the following details row — conscription law.
- `ЛР_ОПЕРАЦИИ` — immutable LR transaction journal.

### Important

`AO` is the mutable LR balance. When the first LR transaction is made for a state, an existing AO formula is replaced by its numeric current balance. The population in `backend!C` is never reduced when manpower is spent.

The gateway calculates the LR capacity using the same formula previously used by the state sheet:

`capacity = min(population, rate * population * (4200 / population)^0.48)`

Amounts sent by Owlbear are in thousands of people: `5` means 5,000 people.

## First setup

1. Create/open an Apps Script project and copy `Code.gs` into it.
2. In **Project Settings → Script properties**, add:
   - `SPREADSHEET_ID` = the spreadsheet ID (the code contains the current table ID as a fallback).
   - `API_TOKEN` = a long random secret shared with the Owlbear scene settings.
3. Run `initializeGateway()` once and grant the requested permissions. It intentionally leaves growth in a migration-pending state.
4. Verify that the old 00:06 growth script has already applied today's growth (if today is after 00:06), or that today's growth has not happened yet (if before 00:06).
5. Run `confirmCurrentGrowthBaseline()` once. This prevents the new project from guessing whether the old growth script already ran.
6. Deploy **Deploy → New deployment → Web app**.
7. Execute the web app as the script owner and allow access to anyone who has the URL. The API additionally requires `API_TOKEN`.
8. Put the deployed `/exec` URL and the same token into the Owlbear settings under the human-resource Apps Script API fields.
9. Disable the old standalone 00:06 population-growth trigger/script. The new project is the sole owner of daily population growth.

## Daily growth

The trigger runs every minute but only performs the daily population update once, at/after 00:06 in the spreadsheet timezone. The last applied calendar date is stored in Script Properties.

Population growth changes only `backend!C`. It never rewrites the current LR in AO.

Both daily growth and LR spend/refund operations use the same `LockService.getScriptLock()`.

## LR spend

The extension sends one `spendLRBatch` request per game command. The script:

1. acquires the script lock;
2. applies any due population growth;
3. reads the current AO LR balances;
4. checks the complete batch before writing anything;
5. if any state lacks enough LR, changes nothing and returns the authoritative snapshot;
6. otherwise subtracts the LR amount directly from the corresponding AO cells;
7. writes the individual audit rows;
8. returns the authoritative population/LR snapshot.

Repeated request IDs are idempotent and do not spend LR twice.

## Refund

A refund is used only when Owlbear has spent the batch in Sheets but cannot persist the corresponding scene transaction. Refund adds the original LR amount back to the current AO balance; it never restores an old population snapshot.

Refunds are also idempotent.

## Owlbear side

The extension treats Google Sheets as authoritative for current population and LR whenever the Apps Script gateway is configured.

For healing and automatic turn completion:

1. Owlbear reads the current sheet snapshot.
2. Existing game mechanics calculate the exact LR delta.
3. The gateway atomically spends that delta in AO.
4. The returned sheet balances replace the local LR cache.
5. The local transaction is marked `RECORDED`.
6. If scene persistence fails, Owlbear calls the compensating refund endpoint.

Thus the persistent LR balance lives in the spreadsheet, while Owlbear keeps only a synchronized cache for game-state rendering.