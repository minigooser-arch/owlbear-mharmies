# Land Armies v2 Design

## Goal

Extend the existing strategic army extension with state-level territory, HP, supply/encirclement, military annexation, irreversible next-turn disband, automatic start of planned routes, and simultaneous same-instant collision resolution.

## Fixed rules

- Armies belong to factions (`Side`), not states.
- States are separate entities and have one optional ruling faction.
- Every cell stores internationally recognized state ownership and de-facto state control separately.
- Existing `factionTerritoryIds` remains a peace-time movement-access layer and is not state ownership.
- Every land army has base `50 / 50 HP`; `0 HP` destroys it.
- Every global turn gives every surviving land army exactly `5 OP = 10 internal movement units`.
- Unspent OP from the prior turn is discarded. There is no forced/accelerated movement and no combat-history speed bonus.
- Planned routes are for a specific future turn and become immutable once that turn starts.
- At turn transition, all valid due routes start together.
- Battle start stops involved armies for the rest of the turn and consumes all remaining OP.
- Retreat remains a manual GM action and is outside automated scope.
- Supply is checked at the start of each turn by orthogonal BFS through cells whose `deFactoStateId` equals the army state's ID, reaching an anchor cell where both recognized and de-facto ownership equal that state.
- Unsupplied armies lose 10% of max HP at each turn start and cannot be healed.
- Only armies of a state's ruling faction can militarily annex enemy state cells, and only during active war involving those states.
- Annexation changes only `deFactoStateId`, never `recognizedStateId`.
- Military annexation occurs only for cells actually entered.
- Any player who belongs to an army's faction may irreversibly request disband of that faction's army. GM may also do so.
- Requested disband executes at the start of the next global turn before supply and movement.
- The always-online Owlbear bot provides a continuously running extension instance for the scheduler; coordinator/idempotency rules still apply.

## New scene data

- `StateEntity { id, name, rulingFactionId, active }`
- `Side.stateId: string | null`
- `CellState.recognizedStateId: string | null`
- `CellState.deFactoStateId: string | null`
- `WarState.participantStateIds: string[]`

## New army data

- `health { hp, maxHp }`
- `supply { supplied, checkedOnTurn }`
- `disband { pending, requestedOnTurn, requestedByPlayerId }`
- `plannedRoute.executeOnTurn: number`
- movement budget remains integer internal units; fixed max is 10 units at every turn transition.

## Turn transition order

1. Acquire/verify coordinator ownership and idempotency.
2. Destroy pending-disband armies.
3. Check supply for all survivors.
4. Apply 10% max-HP encirclement damage.
5. Destroy armies reduced to 0 HP.
6. Set every survivor's movement budget to exactly 10 units; discard any old remainder.
7. Increment turn number.
8. Revalidate routes due for the new turn.
9. Freeze due routes by making them non-editable through command validation.
10. Start all valid due routes together.

## Destruction

All destruction goes through one domain operation which removes army state, battle membership and route/movement state. Owlbear item removal/unregistration is performed by the application persistence layer consistently with current unregister behavior.

## Simultaneous collision resolution

Keep swept collision, but return all enemy contacts at the earliest collision time (within a numeric epsilon) rather than a single pair. Build connected BattleGroups from all contacts before applying positions/status changes. Strategic same-cell entry and A→B / B→A swaps must also be represented as contacts in the same resolver.

## Out of scope

- Automatic retreat resolver.
- Minecraft death listener transport.
- Manpower/cost/upkeep/progression.
- Full healing UI; only a reusable `canHealArmy`/health command contract is required.
