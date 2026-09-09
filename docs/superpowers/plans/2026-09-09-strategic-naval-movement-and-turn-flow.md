# Strategic naval movement and turn flow implementation plan

## Goal

Finish the current naval stage by making turn progression usable, making strategic ship routes respect the ship's bow/facing, moving route completion onto the map, and actually executing planned ship movement when movement phase ends.

## Rules

- Route planning starts from the existing ship/army controls in the extension UI. Do not add a separate start control to Owlbear's tool sidebar.
- A ship may move only forward from its bow.
- Moving forward one cell costs 1 OP.
- Turning 90 degrees costs 1 OP; turning 180 degrees costs 2 OP.
- Strategic route planning automatically inserts the minimum required turns and includes their OP cost.
- If turn + move cost exceeds remaining OP, the next route cell is rejected with an explicit insufficient-OP message.
- Route completion is a map affordance above the last selected cell. Keep undo/clear/cancel as tool actions; remove the redundant finish tool action.
- Completing MOVEMENT resolves planned strategic ship routes and then enters POST_MOVEMENT.
- Completing the global turn is available in POST_MOVEMENT only.

## Tasks

1. Add regression tests for heading-aware ship route cost and final facing.
2. Add shared ship-heading helpers and migrate strategic/tactical movement to them.
3. Update authoritative strategic route planning and commit logic.
4. Update ship route tool activation, preview cost calculation, and messages.
5. Add map finish button/hit testing to the ship route tool and remove redundant finish sidebar action.
6. Make turn controls phase-aware in the UI.
7. Resolve planned ship routes atomically before switching MOVEMENT -> POST_MOVEMENT.
8. Add regression tests for the end-to-end flow.
9. Run full CI/typecheck/lint/tests/build and review the PR diff.
