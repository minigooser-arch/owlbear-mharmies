# Destroyed active ship turn advance

## Scope

When a GM sets the currently active naval battle ship to 0 HP through the existing `SET_SHIP_HP` command, the ship becomes ineligible under the existing naval round rules. Its activation must not remain stuck on the destroyed ship.

## Preserved rules

- `SET_SHIP_HP` remains GM-only.
- 0 HP does not unregister the ship.
- A destroyed ship is excluded by the existing naval eligibility rules.
- Only the currently active ship causes immediate activation advancement when reduced to 0 HP.
- The existing `endNavalShipTurn` transition chooses the next eligible initiative entry.
- This change does not automatically complete the naval battle when no eligible ships remain; battle-end semantics remain separate.
