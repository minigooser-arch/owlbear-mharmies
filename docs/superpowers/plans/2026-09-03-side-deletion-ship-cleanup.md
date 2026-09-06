# Side deletion ship cleanup

Existing `DELETE_SIDE` behavior with `UNREGISTER_ARMIES` now also unregisters ships owned by the deleted side.

- Ship cleanup reuses `destroyShip()` instead of deleting registry entries directly.
- Pending naval requests involving removed ships are cleaned.
- Active naval battle participant, initiative, snapshot, movement/action, and exit references are cleaned.
- If the removed ship was active, activation advances through the existing naval round flow.
- Naval reveal references to removed ships are cleaned.
- Scene revision remains atomic at the command boundary: one `DELETE_SIDE` command produces one scene revision increment.
- `REASSIGN_ARMIES` remains forbidden; no ship transfer behavior is introduced.
