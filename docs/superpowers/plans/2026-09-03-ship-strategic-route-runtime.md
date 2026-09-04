# Ship strategic route runtime wiring

Implemented on `feature/naval-combat-v1`.

## Runtime flow

- Fleet cards expose **Проложить переход** to GMs and leaders of the ship's faction.
- The action opens the dedicated Owlbear ship-route tool instead of broadcasting a pseudo-command.
- The tool edits an ordered orthogonal SEA/CANAL route with one movement point per entered cell.
- Finishing sends the authoritative `SET_SHIP_ROUTE` command.
- The coordinator initializes the same `StrategicGridAdapter` for authoritative `SET_SHIP_ROUTE` processing that is used by other strategic-cell ship commands, so the submitted `startCell` is checked against the real source token cell.
- The coordinator revalidates the source cell, movement budget, terrain, ship state, ownership permissions, and existing planned-route state before committing.
- Committing a strategic route preserves the ship's facing.

## Visibility

- Route previews are local overlays.
- Confirmed ship routes are shown only to the GM and leaders of the owning faction.
- Ship route preview/overlay metadata participates in normal local-overlay cleanup.

## Lifecycle

- The dedicated ship route tool is registered by the background application.
- Route sessions are cancelled on scene open/close.
- Tool cleanup runs during extension shutdown.
- Temporary one-shot patch workflow/script used for the large runtime wiring are not retained in the repository.

## Regression coverage

- `src/background/shipRoutePersistenceIntegration.test.ts` verifies a valid `SET_SHIP_ROUTE` is accepted through the real `ProductionEngine` command boundary and persisted to both scene ship state and source-token metadata.

## Verification

Run the normal repository check on the exact final HEAD:

```text
npm run check
```

This must pass typecheck, lint, the complete Vitest suite, and production build before the block is considered complete.
