# Naval Overlay Runtime Integration

**Goal:** Connect the already-tested naval ship name/HP overlays to `ProductionEngine.visibilityTick` without inventing a naval base detection distance.

**Runtime behavior now under verification:**
- GM receives overlays for every registered ship.
- Players receive overlays for ships belonging to their side.
- Players also receive overlays for ships still revealed through `navalRevealUntilTurn`.
- Hidden enemy ships do not receive name/HP overlays.
- Ship names use faction color.
- HP is displayed under the ship using canonical class max HP.
- Automatic range-based naval detection remains intentionally disconnected until the separate naval base detection range is explicitly defined.
- `navalShipOverlay` items participate in local overlay cleanup.

**TDD:** `src/background/navalOverlayIntegration.test.ts` was RED before the runtime wiring and is expected to turn GREEN with this integration.
