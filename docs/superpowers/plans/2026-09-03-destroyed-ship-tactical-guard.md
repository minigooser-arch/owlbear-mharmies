# Destroyed ship tactical guard

Implemented as a consistency hardening pass for the existing naval turn model.

- `NAVAL_MOVE_FORWARD` rejects an active ship with `hp <= 0` as `SHIP_DESTROYED`.
- `NAVAL_TURN_SHIP` rejects an active ship with `hp <= 0` as `SHIP_DESTROYED`.
- `END_NAVAL_SHIP_TURN` rejects an active ship with `hp <= 0` as `SHIP_DESTROYED`.
- The guard is evaluated after verifying that the ship exists and belongs to the active naval battle, before tactical execution.
- No initiative, movement-cost, battle-end, or victory rules are changed by this patch.
