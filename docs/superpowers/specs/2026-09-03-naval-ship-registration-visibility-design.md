# Naval Ship Registration and Visibility Design

## Scope

This design continues the already-approved naval system on `feature/naval-combat-v1` and covers only ship registration, persistence, and player-visible token reconciliation.

## Confirmed rules

- `REGISTER_SHIP` and `UNREGISTER_SHIP` are GM-only.
- A ship can be registered only from an Owlbear `IMAGE` item.
- Registration is allowed only when the item's strategic cell supports `SEA`; channel cells work because they support both `LAND` and `SEA`.
- A single Owlbear item cannot be both an army and a ship.
- Ship state is persisted in the ship token metadata, not only in scene metadata.
- `scene.ships` remains the runtime/scene registry used by existing naval battle, visibility, and lifecycle modules and must stay synchronized with token metadata.
- Registered source ship tokens are hidden in the shared scene in the same way as registered army source tokens.
- A client sees ship tokens through local clones only for ship IDs returned by `visibleShipIdsForPlayer`.
- GM sees every registered ship.
- Players always see ships of their own factions and ships revealed by existing naval visibility rules.
- Hidden enemy source tokens must not leak through the shared scene.
- Ship name/HP overlays remain tied to the same visible ship ID set.
- Exact range-based naval detection remains outside this task until the separate base naval detection range is restored.

## Registration payload

`REGISTER_SHIP` carries:
- `itemId`
- `sideId`
- `classId`
- `facing`

`UNREGISTER_SHIP` carries:
- `shipId`

## Persistence model

For each registered ship `shipId`:
- `scene.ships[shipId]` contains the canonical in-memory scene copy used by current naval services.
- `item.metadata[METADATA_KEYS.ship]` contains the same `ShipState` for durable token-local persistence.
- persistence writes both copies atomically through the existing command persistence path with rollback protection.
- unregister clears token ship metadata, removes `scene.ships[shipId]`, and restores the source item visibility.

## Visibility model

The shared source item for a registered ship is `visible: false`. `ProductionEngine.visibilityTick` reconciles ship local clones separately from army local clones using the same `LocalCloneReconciler` primitive. The visible ship clone set is the output of `visibleShipIdsForPlayer`.
