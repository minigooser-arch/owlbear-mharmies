# Forces / Fleet UI implementation plan

## Goal
Turn the existing «Войска» top-level tab into a real forces center with separate «Армии» and «Флот» views, using the current Letopis WIKI light design language and existing naval state/commands.

## Constraints
- Do not change naval combat rules, movement rules, detection rules, or initiative.
- Player UI must not leak enemy ship information: GM sees all registered ships; players see only ships belonging to their member factions.
- A token may not be registered simultaneously as an army and a ship.
- Reuse canonical `SHIP_CLASSES` values for labels/stats.
- Only expose ship actions that already exist in the command protocol. For this block that means registration and unregistration; do not invent ship route/edit/battle controls.

## TDD sequence
1. Add failing UI tests for «Армии / Флот» sub-navigation, real ship cards, and GM ship registration.
2. Add failing snapshot test proving player ship lists are role-safe.
3. Add failing command test proving selected-token ship registration is translated into canonical `REGISTER_SHIP`.
4. Add failing registration test proving already-registered ship tokens are rejected.
5. Implement `ShipView` and snapshot plumbing through `MetadataRepository.readShips()`.
6. Implement `REGISTER_SELECTED_SHIP` UI command translation.
7. Add `ForcesPage`, `FleetPage`, and `ShipCard` with the WIKI light hierarchy.
8. Add compact fleet styles in `wiki-light.css`.
9. Run full `npm run check` on the exact HEAD and inspect GitHub Actions logs before completion.
