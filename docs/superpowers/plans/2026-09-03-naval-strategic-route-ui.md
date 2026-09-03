# Naval Strategic Route UI Implementation Plan

**Goal:** Expose the already-approved strategic ship route rules through the Owlbear UI without changing naval combat rules.

## Contract

- Route editing is available to GM and leaders of the ship's faction.
- Routes are strategic orders only in this block; committing a route does not rotate or physically drag the ship token.
- One committed SEA/CANAL cell reserves one remaining global ship movement point through the existing `commitShipStrategicRoute` helper.
- LAND-only and impassable cells are rejected; diagonal steps are rejected.
- A ship in naval battle cannot receive a strategic route.
- Once a route is committed it is displayed on the map and cannot be silently replaced by another route in the same block. Editing before commit is supported by undo/clear in the tool.
- Enemy clients must not receive route overlays.

## Tasks

- [ ] Add `SET_SHIP_ROUTE` command validation, permissions, and authoritative processing.
- [ ] Add an Owlbear ship-route tool with fixed 1 OP per entered cell and SEA/CANAL validation.
- [ ] Add persistent strategic ship-route overlays for GM and faction leaders.
- [ ] Add fleet-card route controls and local tool activation through `ExtensionServices`.
- [ ] Add focused tests first and verify RED before production implementation.
- [ ] Run exact-HEAD `npm run check` in GitHub Actions and inspect logs before completion.
