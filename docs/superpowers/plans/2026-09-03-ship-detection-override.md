# Ship detection override

- Add GM-only `SET_SHIP_DETECTION_OVERRIDE` command.
- Accept `null` to use the shared scene `defaultDetectionRangeCells` value.
- Accept finite non-negative numeric overrides, matching army detection override validation.
- Update only the selected ship's `detectionOverride` and ship revision; the command transaction increments scene revision once.
- Keep faction leaders unable to change this administrative value.

Regression coverage: `src/commands/shipDetectionOverrideCommands.test.ts`.
