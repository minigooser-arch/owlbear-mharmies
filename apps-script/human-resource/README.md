# Google Sheets human-resource gateway

This Apps Script project is the authoritative gateway for population and human-resource operations used by the Owlbear armies extension.

## Spreadsheet

The script uses:

- `backend!A` — country key
- `backend!C` — population, in thousands of people
- `backend!K` — daily population growth factor
- `ГОСУДАРСТВА [1910]!P` — formula projection of population
- `ГОСУДАРСТВА [1910]!AR` — formula-derived human resource

The script **only writes `backend!C`**. It never writes `P` or `AR`.

The audit sheet is `ЛР_ОПЕРАЦИИ`. It keeps one row per game LR transaction even when several transactions are applied atomically in one batch.

## First setup

1. Create/open an Apps Script project and copy `Code.gs` into it.
2. In **Project Settings → Script properties**, add:
   - `SPREADSHEET_ID` = the spreadsheet ID (the code already contains the current table ID as a fallback).
   - `API_TOKEN` = a long random secret shared with the Owlbear scene settings.
3. Run `initializeGateway()` once and grant the requested permissions.
4. Deploy **Deploy → New deployment → Web app**.
5. Execute the web app as the script owner and allow the web app to be accessed by anyone who has the URL. The API itself additionally requires `API_TOKEN`.
6. Put the deployed `/exec` URL and the same token into the Owlbear settings under the human-resource Apps Script API fields.
7. Disable the old standalone 00:06 population-growth trigger/script. The new project is the sole owner of daily population growth.

## Daily growth

The trigger runs every minute but only performs the daily update once, at/after 00:06 in the spreadsheet timezone. The last applied calendar date is stored in Script Properties.

Population growth is:

`population = roundHalfUp(population * growth_rate)`

and the result is written only to `backend!C`.

Both the daily growth and LR spend/refund operations use the same `LockService.getScriptLock()`.

## LR spend

The extension sends one `spendLRBatch` request per game command. The script:

1. acquires the script lock;
2. ensures the current day's population growth has been applied;
3. reads the current formula-derived AR values;
4. checks every operation in the batch;
5. if any operation lacks LR, changes nothing and returns the current snapshot;
6. otherwise decreases only the corresponding `backend!C` cells;
7. flushes the spreadsheet and rereads formula-derived LR;
8. writes the individual audit rows;
9. returns the authoritative population/LR snapshot.

Repeated `batchRequestId` values are idempotent and do not spend population twice.

## Refund

A refund is used only when Owlbear has spent the batch in Sheets but cannot persist the corresponding scene transaction. Refund adds the original amount back to the **current** `backend!C` value; it never restores an old population snapshot, so intervening growth or other operations are not overwritten.

## Owlbear side

The extension treats Google Sheets values as authoritative. The local `humanResource` field is only a cache used to calculate the prospective command result. After a successful batch, the returned Sheets values replace that cache and the individual LR transaction balances are marked as recorded.

No local daily population growth is performed by Owlbear.
