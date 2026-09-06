# Ship Facing Rotation Runtime

## Goal
Keep the Owlbear source token and its local visibility clone visually aligned with authoritative `ShipState.facing`.

## Rules preserved
- NORTH = 0°.
- EAST = 90°.
- SOUTH = 180°.
- WEST = 270°.
- Registration applies the selected initial facing visually.
- Tactical left/right turns update both `ShipState.facing` and source-token rotation.
- Local clones inherit rotation through the existing `LocalCloneReconciler` render-field reconciliation.
- Tactical turns do not mutate strategic return snapshots.
- Persistence rollback restores the token's pre-command rotation if the command transaction fails.

## Verification
- Registration integration test requires EAST to render as 90°.
- Tactical persistence integration test requires EAST → NORTH to render 90° → 0° while preserving position and strategic snapshot.
- Full `npm run check` must pass on the exact final HEAD.
