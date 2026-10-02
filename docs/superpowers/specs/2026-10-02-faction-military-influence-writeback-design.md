# Faction army HP and military influence writeback

## Scope

This change extends the existing Owlbear to Google Sheets writeback. New sheet mutations are limited to the approved projections:

- `ФРАКЦИИ(РАЗРАБОТКА) [1910]`;
- `ГОСУДАРСТВА [1910]` army HP source cell `AN`;
- `ЛР_ОПЕРАЦИИ`.

Other state, economy, ship, and formula columns remain unchanged.

## Stable identity

The extension resolves a state through the canonical `StateEntity.backendCountry` key. The Apps Script validates that key against `backend!A:A`. Displayed state names are never used as identifiers.

Each army projection carries `stateId`, `country` (`backendCountry`), `factionId`, and `factionName`. Technical columns `BA` and `BB` in the faction sheet store the stable `factionId` and canonical `country`.

## Army HP projection

The writeback event carries affected faction totals and affected state totals. The Apps Script writes faction HP to `AS` and state HP to `AN`. Existing derived formulas such as `AH = AN * 75` and `AT = AS * 75` remain untouched. Ships, population, GDP, influence categories, and unrelated sheets are not changed by this projection.

A row without a technical faction binding is bound once by normalized name and country. Duplicate or missing matches fail before mutation. Later writes use the stable faction ID.

## Military influence

No new log sheet is created. Operations are appended to `ЛР_ОПЕРАЦИИ` using additional columns after the live header:

- `operationType`;
- `factionId`;
- `factionName`;
- `influenceDelta`;
- `influenceBefore`;
- `influenceAfter`;
- `reasonCode`.

A blank operation type is treated as a legacy LR row. The script adapts to the actual live LR header order before writing new rows.

The military balance is read and written in faction column `AI`. Operations are idempotent by `requestId`, use the existing script lock, reject negative balances, and preserve all other faction columns.

Allowed rewards: land victory `+4`, naval victory `+4`, destroyed army `+3`, destroyed ship `+3`, successful defense `+3`, successful occupation `+3`.

Allowed costs: ship transfer `-15`, upgrade I `-20`, commander-in-chief `-30`, upgrade II `-30`, upgrade III `-50`.

Only mechanically finalized outcomes emit rewards; damage, participation, proximity, or self-declared victory emits nothing. Independent results use separate request IDs and stack.

## Verification

Tests cover canonical identity, HP aggregation, formula preservation, faction binding, live LR headers, all influence deltas, stacking, insufficient balance, duplicates, and request conflicts.