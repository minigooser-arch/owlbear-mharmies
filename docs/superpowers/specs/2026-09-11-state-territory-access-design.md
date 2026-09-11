# State territory, faction membership, military access, and war movement design

## Goal

Replace the legacy faction-territory movement model with a state-based political map.

The strategic map must represent three independent concepts:

1. terrain;
2. state territory;
3. factions that belong to states and own armies/ships.

Factions do not own map territory. States do.

## Core concepts

### Terrain layer

Terrain remains independent from politics. A cell can simultaneously be mountains and part of Russia, forest and part of Germany, etc.

Painting state territory must never overwrite terrain, impassability, or other terrain properties. Painting terrain must never overwrite state ownership.

### State

`StateEntity` remains the political country entity and should be extended with a map color:

- `id`
- `name`
- `color`
- `rulingFactionId`
- `active`

A state may contain any number of factions, but may have at most one ruling faction.

The ruling faction must belong to that state.

### Faction

`Side` remains the faction entity and continues to own armies and ships.

`Side.stateId` is the single source of truth for faction membership in a state.

A faction belongs to at most one state.

There are no faction-owned map territories.

### Cell state

The political layer uses the already existing state ownership fields:

- `recognizedStateId`
- `deFactoStateId`

`factionTerritoryIds` becomes legacy migration data only and must not participate in movement authorization after migration.

For the initial implementation, state-border movement authorization uses `recognizedStateId` as the legal territory owner. `deFactoStateId` remains available for the existing/future occupation and territorial-control mechanics and must not be destroyed by this work.

## State administration UI

Add a dedicated States administration page available to GM/admin users.

A state card supports:

- create state;
- rename state;
- choose state color;
- activate/deactivate state;
- see factions whose `stateId` points to the state;
- assign the single ruling faction;
- clear/change the ruling faction;
- delete a state subject to validation/migration rules.

Faction editing must include a state selector. Changing faction membership updates `Side.stateId`; there is no duplicated faction list inside the state object.

## State territory editor

The map editor gains two independent editing modes:

- Terrain
- States

State mode provides:

- state selector;
- brush sizes consistent with the terrain editor;
- erase-state tool;
- painting of `recognizedStateId` only.

Changing state ownership must not modify `terrainId`, `impassable`, or any terrain configuration.

Changing terrain must not modify `recognizedStateId` or `deFactoStateId`.

## Political overlay rendering

Terrain remains the dominant cell fill.

State ownership is rendered as an additional political overlay, preferably:

- state-colored borders around contiguous state territory;
- optional very-low-opacity state tint only if it does not obscure terrain;
- optional state labels later, not required for the first implementation.

The player must be able to perceive mountains, forests, swamps, etc. while also seeing which state owns the same cells.

## Interstate relations

Introduce state-level relations for movement authorization.

### Military access

Military access is directional.

Example:

- Russia → Germany access does not imply Germany → Russia access.

The data model should represent explicit directed access, for example a normalized relation registry keyed by `(fromStateId, toStateId)` with `militaryAccess: boolean`.

GM/admin users can grant or revoke military access between states in the States/Diplomacy administration UI.

The UI may offer a convenience action to set both directions, but the stored relation remains directional.

Military access applies to every faction belonging to the source state, not only the ruling faction.

### War

War is a mutual state-level condition.

`WarState.participantStateIds` becomes the authoritative basis for interstate war movement authorization.

A state-level war grants every faction belonging to either belligerent state the right to enter the other belligerent state's territory.

War does not require a faction to be the ruling faction in order to invade.

## Movement authorization rules

Movement authorization is centralized in a state-aware movement access resolver rather than scattered through route planning and execution.

The resolver receives at minimum:

- moving faction;
- moving faction's state;
- whether that faction is the ruling faction;
- destination cell's recognized state;
- active wars;
- directed military-access relations;
- movement domain/terrain information.

### Destination inside own state

Any faction may move inside its own state's territory.

### Destination in another state with military access

Any faction may enter if its state has directed military access into the destination state.

### Destination in another state while the states are at war

Any faction may enter if its state is at war with the destination state.

### Destination in another state with neither access nor war

If the moving faction is not the ruling faction:

- movement is denied;
- no war is created.

If the moving faction is the ruling faction:

- entering the foreign cell automatically declares war between the two states;
- the same movement step is then authorized;
- war creation and movement must be atomic from the gameplay perspective.

### Stateless faction

A faction with `stateId = null` has no implicit right to enter state territory. Unless a future explicit rule is added, movement into a state-owned cell is denied.

### Neutral/unowned cell

A cell with `recognizedStateId = null` is not foreign state territory. Initial implementation allows normal terrain/domain rules to decide movement there; no war is generated merely by entering an unowned cell.

## Route planning versus route execution

Route planning must not declare war.

While planning, foreign cells are classified as:

- legal because own state;
- legal because military access;
- legal because existing war;
- invasion trigger for a ruling faction;
- forbidden for a non-ruling faction.

The route UI should visibly warn when a ruling faction's planned path would cross into a state with neither access nor war.

Actual war declaration occurs only when movement execution attempts to enter the first such foreign cell.

This rule is evaluated per movement step. A route can therefore cross multiple states, and each border crossing is evaluated independently.

Example:

Russia → Germany → France

If Russia has neither access nor war with either state and the moving faction is Russia's ruling faction:

1. entering Germany declares Russia–Germany war;
2. later entering France declares Russia–France war.

## Armies and collision behavior

This state-access redesign does not change army collision mechanics.

Armies may still enter cells occupied by other armies according to the existing collision/battle rules; doing so may create/join a battle.

Political access is checked before the movement step is committed, then army collision/battle logic runs as it does today.

## Ships

State land borders do not automatically restrict movement through sea cells.

For the first implementation:

- SEA movement continues to use naval movement rules;
- state ownership on nearby land does not block ships;
- territorial waters, straits, canals, closed ports, and naval access are explicitly out of scope.

Ship occupied-cell rules remain separate: two live ships cannot occupy the same cell.

## War creation semantics

Automatic war declaration is permitted only for a ruling faction crossing into foreign state territory without military access and without an existing war.

The command/movement transaction must:

1. resolve destination state;
2. resolve source faction and source state;
3. check existing state war;
4. check directed military access;
5. if unauthorized and mover is ruling faction, create/activate the interstate war;
6. commit the movement step;
7. continue with ordinary collision/battle processing.

If war creation fails validation or persistence, movement into the foreign cell must not occur.

Repeated crossings during an already active war must not create duplicate wars.

## Data migration

The migration must preserve existing scenes.

Required behavior:

- preserve `states`, `Side.stateId`, `recognizedStateId`, and `deFactoStateId`;
- retain legacy `factionTerritoryIds` only long enough to deserialize/migrate old data;
- movement logic must stop reading `factionTerritoryIds`;
- do not infer state territory from faction territory automatically unless a deterministic mapping exists;
- scenes with incomplete political data remain loadable and produce explicit admin-visible warnings rather than corrupting ownership.

A schema-version bump is expected because the state entity and interstate-relation storage change.

## Suggested modules

Keep responsibilities isolated.

### `states/stateService`

State CRUD, ruling-faction validation, faction/state consistency.

### `states/stateRelations`

Directed military-access storage/query helpers and symmetric war-state lookup helpers.

### `movement/stateMovementAccess`

Pure authorization/classification logic returning outcomes such as:

- `ALLOW_OWN_STATE`
- `ALLOW_MILITARY_ACCESS`
- `ALLOW_WAR`
- `DECLARE_WAR_AND_ALLOW`
- `DENY_FOREIGN_STATE`
- `DENY_STATELESS`

### `terrain/gridMap`

Continue owning cell persistence, but expose state-paint operations that only mutate political ownership fields.

### political overlay service

Render state boundaries independently from terrain overlays.

### UI

- States administration page
- state relation/military access controls
- faction state selector
- state map brush mode
- route warning presentation

## Error handling and user messages

Add explicit user-facing errors/warnings rather than generic movement failures, including:

- faction has no state;
- foreign territory is closed to this faction;
- state/faction political configuration is invalid;
- ruling faction mismatch;
- attempted state deletion while still referenced;
- interstate relation references missing state;
- automatic war declaration failed.

Route planning warnings are informational and must not mutate state.

## Tests

The implementation requires RED→GREEN coverage for at least:

1. terrain and state ownership coexist on one cell;
2. painting a state does not change terrain;
3. painting terrain does not change state ownership;
4. faction membership is derived only from `Side.stateId`;
5. ruling faction must belong to its state;
6. ordinary faction moves inside own state;
7. ordinary faction is denied entry into closed foreign territory;
8. ordinary faction enters foreign territory with military access;
9. ordinary faction enters enemy territory during war;
10. ruling faction enters foreign territory with access without creating war;
11. ruling faction enters foreign territory during existing war without duplicate war;
12. ruling faction crossing a closed foreign border creates war and enters atomically;
13. route planning warns but never declares war;
14. multi-state route declares wars only on actual relevant crossings;
15. directed access does not imply reverse access;
16. stateless faction cannot enter state-owned territory;
17. unowned territory does not trigger war;
18. army collision/battle behavior remains unchanged after political authorization;
19. ship sea movement remains unaffected by land-state access;
20. legacy `factionTerritoryIds` no longer authorizes movement;
21. snapshot/persistence round-trip preserves states, relations, and cell political ownership;
22. UI shows state borders and terrain simultaneously.

## Implementation order

1. schema/data model and migrations;
2. state CRUD + ruling-faction invariants;
3. directed military-access model;
4. independent state painting operations;
5. political overlay rendering;
6. state/faction admin UI;
7. centralized movement-access classifier;
8. route-planning warnings;
9. authoritative movement execution + automatic war creation;
10. remove all runtime use of `factionTerritoryIds`;
11. integration/regression coverage across armies, wars, routes, map editing, persistence, and naval non-regression.

## Non-goals for this implementation

- territorial waters;
- naval military-access diplomacy;
- automatic annexation from movement;
- diplomatic AI;
- alliances/guarantees/non-aggression pacts beyond existing war and the new military-access relation;
- replacing the existing de-facto occupation/territorial-transfer mechanics;
- changing army battle/collision rules.
