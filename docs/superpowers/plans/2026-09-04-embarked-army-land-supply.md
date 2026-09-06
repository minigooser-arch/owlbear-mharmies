# Embarked army land-supply exemption

## Scope

- Apply the already-approved rule that an army genuinely embarked on a ship is excluded from land supply and land encirclement processing at the global turn boundary.
- Treat embarkation as authoritative only when the cross-reference is reciprocal: `army.embarkedOnShipId === shipId` and `scene.ships[shipId].embarkedArmyId === armyId`.
- A stale or orphan `embarkedOnShipId` does not grant supply immunity.
- While genuinely embarked, set the army's new-turn supply state to supplied for the current turn and do not apply encirclement damage.
- Do not implement embark/disembark commands, consent flow, transport movement coupling, or route semantics in this slice.
- Do not alter ship ownership; foreign embarked armies remain compatible with the previously approved transport rule.

## Verification

- RED: genuinely embarked army on an unsupplied land cell currently receives encirclement damage.
- GREEN: reciprocal embarkment skips land supply damage while an orphan link still follows normal land supply rules.
- Exact final HEAD must pass `npm run check` (typecheck, lint, full Vitest suite, production build).
