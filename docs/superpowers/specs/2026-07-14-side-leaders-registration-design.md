# Side Leaders, Army Registration, and Route Visibility Design

## Status

Approved in conversation on 2026-07-14. This specification replaces the abandoned join-key idea.

## Problem

The published extension has two blocking UI-to-domain gaps:

- `SidesPage` emits `CREATE_SIDE` without the required `Side` payload, so the coordinator cannot apply the command and the user receives no useful feedback.
- Army registration, context actions, and the map route controller exist as isolated modules but are not connected to the production popover and Owlbear SDK lifecycle.

The correction must also introduce side leaders without trusting display names and must make route visibility depend on whether a route has started.

## Chosen model

Extend each side with `leaderPlayerIds: string[]`. A leader is identified only by Owlbear's internal `Player.id`; the player's displayed name is presentation data and never participates in authorization. Multiple leaders and membership in multiple sides are allowed.

Scene schema version 2 adds `leaderPlayerIds` to every side. Migration from version 1 supplies an empty list, removes duplicates, and enforces that every leader is also present in `playerIds`. Legacy `directOwnerPlayerId` army metadata may be read for compatibility but is ignored for authorization, omitted for new registrations, and hidden from the UI.

Invariants:

- `leaderPlayerIds` and `playerIds` contain unique internal player IDs.
- Every leader is a member of the same side.
- Assigning a leader automatically adds that player to `playerIds`.
- Removing leadership leaves the player as an ordinary member until explicitly removed.
- A leader cannot remove another leader, or themselves while still a leader, from side membership.

## Authorization

The background coordinator derives the sender from the broadcast event's connection ID and the current Owlbear party. Payload player IDs and player names are never trusted.

- GM can create, rename, and delete sides; assign or remove leaders; manage any side's members; register or unregister armies; edit any route; and control movement.
- A side leader can add or remove ordinary players from that leader's side and can set or clear routes for armies belonging to that side.
- A side leader cannot assign leaders, manage another side, start, pause, resume, stop, or globally control movement unless the same user is GM.
- An ordinary member has no mutation permissions from these flows.
- A single player may be a member or leader of multiple sides independently.

New GM-only commands manage leadership explicitly. Existing member commands gain the leader-of-this-side authorization path. `SET_ROUTE` and `CLEAR_ROUTE` gain the GM-or-army's-side-leader path. Movement commands remain GM-only.

## Side management UI

The GM view of the Sides tab contains a real creation form with a required trimmed name and a color input. Submission creates a complete side object with a generated UUID, empty member list, and empty leader list. Invalid input and rejected commands produce Russian Owlbear notifications.

Each side card lists currently known players by display name while using their internal IDs as values. GM can toggle ordinary membership and leadership. Leaders see membership controls only for their own sides and cannot modify leadership. Persisted members who are temporarily disconnected remain assigned and are shown as unavailable when their ID is known but no live party record exists.

## Army registration UI

Only GM sees the registration panel on the Armies tab:

1. Select exactly one Owlbear Image token on the scene.
2. Choose a side.
3. Press `Сделать армией`.

Any selected Image token is eligible if it is not already registered. Shapes, curves, text, labels, empty selection, and multiple selection are rejected with a Russian notification. The submitted command contains the selected source item ID and side ID only; there is no individual owner.

Registration continues through the authoritative command gateway. On acceptance, the original source receives army metadata and becomes globally hidden, while permitted clients receive local Image clones. GM also gets an explicit unregister action that removes only extension army metadata and restores the source token.

## Route editing and movement controls

The existing `RouteToolController` is registered with Owlbear during extension startup and removed during cleanup. Pressing `Маршрут` on an army card activates it for that army. The tool uses exact Owlbear grid distance, existing barrier checks, local preview overlays, and `Backspace`, `Enter`, and `Escape`. `Enter` submits `SET_ROUTE`; cancellation makes no domain change.

The route button is visible only to GM and leaders of the army's side. Start, pause, resume, stop, and global movement controls remain visible and authorized only for GM.

## Route visibility

Routes never become visible to another side merely because that side can detect the army.

- Empty routes render no overlay.
- `READY`: the route is planned but not running, so only GM and leaders of the army's side see it.
- `MOVING`, `PAUSED`, or `IN_BATTLE`: the route has been started, so GM and every member of the army's side see it.
- `STOP` and successful arrival return the army to `READY`; the retained route becomes private to GM and side leaders again.

Route overlay reconciliation receives the current player's member-side and leader-side IDs and filters before creating local items.

## Feedback and failures

UI operations await their acknowledgement. `REJECTED`, `CONFLICT`, timeout, invalid selection, wrong item type, duplicate registration, and missing side are translated into Russian Owlbear notifications. Malformed broadcast payloads are rejected without throwing out of the coordinator handler, so the sender receives an acknowledgement instead of a silent timeout.

## Testing

Implementation follows red-green TDD and adds coverage for:

- side creation emitting a complete valid command;
- schema v1-to-v2 migration and leader/member invariants;
- multiple leaders and multi-side membership;
- authorization by internal player ID, including identical display names and forged payload IDs;
- GM-only leader assignment and movement controls;
- leader member management limited to that leader's sides;
- GM-or-side-leader route editing;
- GM-only Image-token registration with empty, multiple, wrong-type, and duplicate selections;
- production wiring of registration and route-tool lifecycle;
- planned versus started route overlay visibility for GM, leaders, ordinary members, and other sides;
- Russian feedback for command rejection and timeout.

The full local gate and GitHub Pages workflow must pass. After deployment, public assets are checked over HTTPS. Live-room verification covers creating a side, assigning multiple leaders, adding a player, registering a token, planning a private route, starting it, and confirming the route becomes visible to an ordinary member of that side.

## Out of scope

- Join keys or self-service joining.
- Individual army owners.
- Leader movement controls beyond setting and clearing routes.
- Registering non-Image scene items as armies.
- A server backend or cryptographic secrecy for Owlbear room metadata.
