# Ship detection override

- Add GM-only `SET_SHIP_DETECTION_OVERRIDE` command.
- Accept `null` to use the shared scene `defaultDetectionRangeCells` value.
- Accept finite non-negative numeric overrides, matching army detection override validation.
- Update only the selected ship's `detectionOverride` and ship revision; the command transaction increments scene revision once.
- Keep faction leaders unable to change this administrative value.
- Expose both the configured override and effective detection range in the role-safe ship snapshot.
- Show the editor only inside the GM ship management section, with exact numeric input and an explicit reset to the shared range.
- Allow the GM to pin the currently inherited shared value as an explicit ship override; this preserves that value if the global default later changes.
- Keep both detection fields required on `ShipView`; test fixtures must model the same snapshot contract instead of weakening the type.

Regression coverage:
- `src/commands/shipDetectionOverrideCommands.test.ts`
- `src/owlbear/shipDetectionSnapshot.test.ts`
- `src/ui/components/ShipDetectionEditor.test.tsx`
- `src/background/shipDetectionOverridePersistenceIntegration.test.ts`
