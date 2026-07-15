# Letopis Armies v1.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release Letopis Armies 1.2.0 with private army lists, grid-centred/clamped routes, editable battle names, stable non-flickering UI/overlays, reliable command acknowledgements, and the supplied sword icon.

**Architecture:** Scene metadata migrates from schema 2 to schema 3 for named battles. Map visibility and list authorization become separate projections; routes are normalized through one Owlbear grid-snap port before preview and again before authoritative persistence. Local graphics use semantic keys and differential reconciliation, while popover refreshes and command acknowledgements gain coalescing/versioning so unchanged or mixed-version clients cannot present generic timeouts.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, Testing Library, Owlbear Rodeo SDK 3.1.0, Vite 8, GitHub Pages.

## Global Constraints

- Release version is exactly `1.2.0`; scene schema is exactly `3`; Owlbear `manifest_version` remains `1`.
- GM is the only role allowed to register or unregister armies and rename battles.
- A player's UI list contains only armies belonging to any side of which that player is a member; GM sees all armies. Map detection remains unchanged.
- Route planning remains GM/side-leader only. Planned READY routes remain visible only to GM and that side's leaders; started routes remain visible to side members.
- Registration physically moves the token to its snapped cell centre. Existing registered tokens move to the snapped centre only after their next successful `SET_ROUTE`.
- Every accepted waypoint is a grid-cell centre. A pointer beyond the route allowance is clamped to the farthest reachable snapped centre and stays green; movement barriers remain red and reject the point.
- Identical overlay or snapshot reconciliation performs zero platform writes and zero subscriber notifications.
- Battle names are trimmed, 1–80 Unicode code points, deterministic for migrated/created battles, and preserved through reinforcement and merge.
- Command protocol is version `2`; mixed old/new clients resolve a trusted current pending acknowledgement or receive an immediate actionable error, never a misleading generic timeout.
- User-facing errors remain Russian. No backend or new runtime dependency is introduced.

---

## File Structure

- `src/shared/types.ts`, `src/shared/validation.ts`, `src/storage/migrations.ts`: scene schema 3 and named battle model.
- `src/battles/battleGroupService.ts`: deterministic default names and name preservation.
- `src/commands/*`, `src/background/application.ts`: rename command, authoritative route normalization, protocol/readiness acknowledgements.
- `src/owlbear/sdkAdapter.ts`, `src/owlbear/routeTool.ts`, `src/background/routeToolService.ts`: grid snapping, route clamping, and centring.
- `src/routes/routeOverlayService.ts`, `src/barriers/barrierOverlayService.ts`: semantic differential reconciliation.
- `src/owlbear/extensionServices.ts`, `src/ui/state/useExtensionState.ts`: role-safe army projection and coalesced stable refreshes.
- `src/ui/pages/BattlesPage.tsx`, `src/ui/pages/ArmiesPage.tsx`, `src/ui/App.tsx`, `src/ui/app.css`: rename UI, authorized filters, and new icon.
- `public/icon-1.2.png`, `public/manifest.json`, `package*.json`: release assets/version/cache busting.

---

### Task 1: Scene Schema 3 and Stable Battle Names

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/metadataRepository.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/battles/battleGroupService.ts`
- Test: `src/shared/validation.test.ts`
- Test: `src/storage/migrations.test.ts`
- Test: `src/battles/battleGroupService.test.ts`

**Interfaces:**
- Produces: `BattleGroup.name: string`, `SceneState.version: 3`, `nextBattleName(groups): string`.
- Preserves: the name belonging to the lexically surviving `battleId` when components merge.

- [ ] **Step 1: Add failing schema and battle-service tests**

```ts
it("migrates v2 battles to deterministic names", () => {
  const result = migrateSceneState(scene({
    version: 2,
    battleGroups: [
      { battleId: "z", participantIds: ["z1", "z2"], revision: 1 },
      { battleId: "a", participantIds: ["a1", "a2"], revision: 2 }
    ]
  }));
  expect(result).toMatchObject({ ok: true, value: { version: 3, battleGroups: [
    { battleId: "a", name: "Бой 1" },
    { battleId: "z", name: "Бой 2" }
  ] } });
});

it("preserves the lexically surviving battle name on merge", () => {
  expect(mergeBattleGroups([
    { battleId: "b", name: "Юг", participantIds: ["b1", "b2"], revision: 1 },
    { battleId: "a", name: "Север", participantIds: ["a1", "a2"], revision: 4 }
  ], ["a", "b"])[0]?.name).toBe("Север");
});

it("uses the first free numbered name", () => {
  expect(nextBattleName([
    { battleId: "x", name: "Бой 1", participantIds: [], revision: 1 },
    { battleId: "y", name: "Бой 3", participantIds: [], revision: 1 }
  ])).toBe("Бой 2");
});
```

- [ ] **Step 2: Run red tests**

Run: `npm.cmd test -- src/shared/validation.test.ts src/storage/migrations.test.ts src/battles/battleGroupService.test.ts`

Expected: FAIL because schema 3 and `BattleGroup.name` do not exist.

- [ ] **Step 3: Implement schema 3 and deterministic naming**

```ts
export interface BattleGroup {
  battleId: string;
  name: string;
  participantIds: string[];
  revision: number;
}

export interface SceneState {
  version: 3;
  // existing fields unchanged
}

export function nextBattleName(groups: readonly BattleGroup[]): string {
  const used = new Set(groups.map((group) => group.name));
  for (let index = 1; ; index += 1) {
    const candidate = `Бой ${index}`;
    if (!used.has(candidate)) return candidate;
  }
}
```

`normalizeBattleGroup` must require a trimmed non-empty name and preserve it. `migrateSceneState` must accept versions 0–3, upgrade old sides as before, then assign `Бой 1`, `Бой 2`, … in lexical `battleId` order before normalization. New-scene fallbacks in the repository and extension services become `{ version: 3 }`. New components call `nextBattleName`; overlapping components copy the name from the lowest overlapping `battleId`.

- [ ] **Step 4: Run green tests and commit**

Run: `npm.cmd test -- src/shared/validation.test.ts src/storage/migrations.test.ts src/battles/battleGroupService.test.ts && npm.cmd run typecheck`

Expected: PASS.

Commit: `git commit -am "feat: add stable battle names"`

---

### Task 2: Authorized Army Lists and Editable Battle Names

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/permissions.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandProcessor.ts`
- Modify: `src/owlbear/notifications.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/ui/pages/ArmiesPage.tsx`
- Modify: `src/ui/pages/BattlesPage.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/commands/commandValidation.test.ts`
- Test: `src/commands/commandProcessor.test.ts`
- Test: `src/owlbear/extensionServices.test.ts`
- Test: `src/ui/state/useExtensionState.test.tsx`
- Test: `src/ui/pages/ArmiesPage.test.tsx`
- Create: `src/ui/pages/BattlesPage.test.tsx`

**Interfaces:**
- Produces: `{ type: "RENAME_BATTLE_GROUP"; battleId: string; name: string }` and `mapVisibleSourceIds`.
- `buildRoleSafeSnapshot` returns already-authorized `ArmyView[]`; the hook never expands this set.

- [ ] **Step 1: Add failing authorization/projection/UI tests**

```ts
it("keeps a detected enemy off a player's army list", () => {
  const snapshot = buildRoleSafeSnapshot(input({
    role: "PLAYER", playerId: "red-player",
    mapVisibleSourceIds: new Set(["blue-army"])
  }));
  expect(snapshot.mapVisibleSourceIds).toContain("blue-army");
  expect(snapshot.armies.map((army) => army.id)).toEqual(["red-army"]);
});

it("returns the union of all member-side armies", () => {
  const snapshot = buildRoleSafeSnapshot(multiSideMemberInput());
  expect(snapshot.armies.map((army) => army.id).sort()).toEqual(["blue-army", "red-army"]);
});

it("rejects a crafted player registration", () => {
  expect(processor.execute(playerContext(), command({
    type: "REGISTER_ARMY", itemId: "image", sideId: "red"
  }))).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
});

it("rejects a crafted player unregister without mutating state", () => {
  const context = playerContext();
  const before = structuredClone(context.state);
  const result = processor.execute(context, command({
    type: "UNREGISTER_ARMY", armyId: "red-army"
  }));
  expect(result).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  expect(context.state).toEqual(before);
});

it("renames a battle for GM and rejects players", () => {
  expect(renameAsGm("  Переправа  ")).toMatchObject({
    status: "ACCEPTED",
    state: { scene: { battleGroups: [{ name: "Переправа", revision: 2 }] } }
  });
  expect(renameAsPlayer("Чужое имя")).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
});
```

UI test: GM edits the `textbox` labelled `Название боя` and sends the rename command; player sees the name as text with no textbox. Add invalid-name cases for blank and 81 code points.

- [ ] **Step 2: Run red tests**

Run: `npm.cmd test -- src/commands/commandValidation.test.ts src/commands/commandProcessor.test.ts src/owlbear/extensionServices.test.ts src/ui/state/useExtensionState.test.tsx src/ui/pages/ArmiesPage.test.tsx src/ui/pages/BattlesPage.test.tsx`

Expected: FAIL on the new command, projection, field rename, and editor.

- [ ] **Step 3: Implement the role-safe projection and rename command**

```ts
const authorizedRecords = input.role === "GM"
  ? input.armies
  : input.armies.filter(({ state }) => memberSideIds.has(state.sideId));

const mapVisibleSourceIds = new Set(input.mapVisibleSourceIds);
for (const { item, state } of input.armies) {
  if (input.role === "GM" || memberSideIds.has(state.sideId)) mapVisibleSourceIds.add(item.id);
}

case "RENAME_BATTLE_GROUP": {
  const group = state.scene.battleGroups.find((item) => item.battleId === command.battleId);
  if (!group) return "BATTLE_NOT_FOUND";
  group.name = command.name.trim();
  group.revision += 1;
  return undefined;
}
```

Validate names with `[...name.trim()].length` between 1 and 80 and return `INVALID_BATTLE_NAME`; return `BATTLE_NOT_FOUND` for a missing group and add Russian notification text for both. Rename `visibleSourceIds` to `mapVisibleSourceIds` across snapshots/fixtures. As defense in depth, `useExtensionState` repeats the member-side filter for PLAYER but never consults `mapVisibleSourceIds`; counters use that authorized result. Build side filters from sides represented in authorized armies for players; GM keeps all configured sides for registration.

- [ ] **Step 4: Run green tests and commit**

Run: `npm.cmd test -- src/commands src/owlbear/extensionServices.test.ts src/ui && npm.cmd run typecheck`

Expected: PASS.

Commit: `git commit -am "feat: secure army lists and rename battles"`

---

### Task 3: Grid-Centred Registration and Clamped Route Editing

**Files:**
- Modify: `src/grid/gridDistance.ts`
- Modify: `src/owlbear/sdkAdapter.ts`
- Modify: `src/routes/routeMath.ts`
- Modify: `src/owlbear/routeTool.ts`
- Modify: `src/background/routeToolService.ts`
- Modify: `src/background/application.ts`
- Test: `src/owlbear/sdkAdapter.test.ts`
- Test: `src/routes/routeMath.test.ts`
- Test: `src/owlbear/routeTool.test.ts`
- Test: `src/background/routeToolService.test.ts`
- Test: `src/background/application.test.ts`

**Interfaces:**
- Produces: `GridGeometryPort.snapGridCenter(position): Promise<Vector2>` and `clampRoutePoint(...)`.
- Authoritative processing re-snaps every point; successful registration/route persistence updates the physical token position.

- [ ] **Step 1: Add failing snapping and clamping tests**

```ts
it("snaps through Owlbear with full cell-centre sensitivity", async () => {
  await adapter.snapGridCenter({ x: 17, y: 29 });
  expect(sdk.scene.grid.snapPosition).toHaveBeenCalledWith({ x: 17, y: 29 }, 1, false, true);
});

it("clamps beyond-limit input to the farthest reachable snapped centre", async () => {
  const result = await clampRoutePoint({
    start: { x: 50, y: 50 }, committed: [], requested: { x: 999, y: 50 },
    limitCells: 3, grid
  });
  expect(result).toEqual({ point: { x: 350, y: 50 }, lengthCells: 3, remainingCells: 0 });
});

it("commits the clamped preview point, never the raw pointer", async () => {
  controller.activate("army", { x: 50, y: 50 }, 3, []);
  await controller.click({ x: 999, y: 50 });
  expect(controller.key("Enter")).toMatchObject({ route: [{ x: 350, y: 50 }] });
});
```

Add application tests that registration updates `position` to the snapped centre, legacy armies centre on successful `SET_ROUTE`, and rejection/cancel leaves position untouched. Add an authoritative forged-unsnapped-route test expecting rejection before persistence; re-normalizing already-centred coordinates must be idempotent.

- [ ] **Step 2: Run red tests**

Run: `npm.cmd test -- src/owlbear/sdkAdapter.test.ts src/routes/routeMath.test.ts src/owlbear/routeTool.test.ts src/background/routeToolService.test.ts src/background/application.test.ts`

Expected: FAIL because no snap port or clamp exists.

- [ ] **Step 3: Implement snap and clamp**

```ts
export interface GridGeometryPort extends GridDistancePort {
  snapGridCenter(position: Vector2): Promise<Vector2>;
}

snapGridCenter: (position) => sdk.scene.grid.snapPosition(position, 1, false, true)
```

`clampRoutePoint` first snaps the request. If the measured complete route fits, return it. Otherwise binary-search interpolation from the last accepted anchor toward the raw request for 24 iterations; snap each candidate, retain the farthest candidate whose complete route is within the limit, and return it with `remainingCells: 0` when no farther snapped centre is legal. Reject a duplicate of the last committed point. Evaluate the barrier only against the actual clamped segment; barriers remain red/invalid, while a limit clamp is green/valid and labelled `Осталось: 0`.

In `RouteToolController`, store `preview.point` on click. In `RouteToolService.loadSession`, expose the snapped start. In `commitRoute` and `ProductionEngine.processCommand`, re-snap and validate the route before persistence. Persist the first snapped centre as the token position while route points remain future centres; registration also patches the selected source position to its snapped centre.

- [ ] **Step 4: Run green tests and commit**

Run: `npm.cmd test -- src/owlbear/sdkAdapter.test.ts src/routes/routeMath.test.ts src/owlbear/routeTool.test.ts src/background/routeToolService.test.ts src/background/application.test.ts && npm.cmd run typecheck`

Expected: PASS.

Commit: `git commit -am "feat: snap and clamp army routes"`

---

### Task 4: Differential Overlays and Coalesced UI Refresh

**Files:**
- Create: `src/owlbear/localOverlayReconciler.ts`
- Create: `src/owlbear/localOverlayReconciler.test.ts`
- Create: `src/owlbear/refreshCoordinator.ts`
- Create: `src/owlbear/refreshCoordinator.test.ts`
- Create: `src/owlbear/snapshotEquality.ts`
- Create: `src/owlbear/snapshotEquality.test.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/owlbear/sdkAdapter.ts`
- Modify: `src/background/routeToolService.ts`
- Modify: `src/routes/routeOverlayService.ts`
- Modify: `src/barriers/barrierOverlayService.ts`
- Modify: `src/background/application.ts`
- Test: `src/owlbear/extensionServices.test.ts`
- Test: `src/owlbear/sdkAdapter.test.ts`
- Test: `src/background/routeToolService.test.ts`
- Test: `src/routes/routeOverlayService.test.ts`
- Test: `src/barriers/barrierOverlayService.test.ts`

**Interfaces:**
- Produces: batch `addLocalItems(items)`, `updateLocalItems(updates)`, semantic overlay keys, `RefreshCoordinator.request()`.
- Guarantees: add/update before delete; same desired state causes no write.

- [ ] **Step 1: Add failing zero-write and stale-refresh tests**

```ts
it("performs zero writes for identical route overlays", async () => {
  const service = new RouteOverlayService(portWithExisting(desiredRouteItems));
  await service.reconcile(routes, gmViewer);
  expect(port.addItems).not.toHaveBeenCalled();
  expect(port.updateItems).not.toHaveBeenCalled();
  expect(port.deleteItems).not.toHaveBeenCalled();
});

it("coalesces overlap and never publishes an older refresh last", async () => {
  const coordinator = createRefreshCoordinator(loadDeferred, publish, semanticSnapshotEqual);
  coordinator.request();
  coordinator.request();
  resolveFirst(oldSnapshot);
  resolveSecond(newSnapshot);
  await coordinator.whenIdle();
  expect(publish).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenLastCalledWith(newSnapshot);
});
```

Add preview, barrier, route, and SDK batch tests. Add a semantic-equality test for sets/maps/arrays and a local-overlay-only change test that does not request a UI refresh.

- [ ] **Step 2: Run red tests**

Run: `npm.cmd test -- src/routes/routeOverlayService.test.ts src/barriers/barrierOverlayService.test.ts src/background/routeToolService.test.ts src/owlbear/sdkAdapter.test.ts src/owlbear/refreshCoordinator.test.ts src/owlbear/snapshotEquality.test.ts src/owlbear/extensionServices.test.ts`

Expected: FAIL because current code deletes/recreates and publishes every completion.

- [ ] **Step 3: Implement semantic reconciliation and refresh coordination**

```ts
export interface RefreshCoordinator {
  request(): void;
  whenIdle(): Promise<void>;
}

export function createRefreshCoordinator<T>(
  load: () => Promise<T>,
  publish: (snapshot: T) => void,
  equal: (left: T, right: T) => boolean
): RefreshCoordinator;

const key = `${armyId}:${kind}:${index ?? ""}`;
```

Implement `reconcileLocalOverlays(port, existingKey, desired)` in `localOverlayReconciler.ts`. Index existing items by metadata key (`armyId/kind/index`, `barrierId`). Preserve an existing ID for a matching key; compare only rendered fields; batch-add missing and batch-update changed before deleting stale/duplicate items. Apply the same reconciler to active previews. Extend the SDK adapter with true collection batch operations, including real SDK Curve `points/style.strokeColor` and Label `position/text.plainText/text.style.fillColor` updates.

The refresh coordinator allows one active load and one trailing request. A generation guard prevents an older result publishing after a newer request. Publish only when semantic snapshot equality fails. Scene/local changes consisting exclusively of this extension's route/barrier/preview metadata do not schedule a popover refresh; heartbeat and movement-only fields must not rerender unrelated panels.

- [ ] **Step 4: Run green tests and commit**

Run: `npm.cmd test -- src/routes src/barriers src/background/routeToolService.test.ts src/owlbear && npm.cmd run typecheck`

Expected: PASS.

Commit: `git commit -am "fix: stop overlay and interface flicker"`

---

### Task 5: Protocol v2 and Actionable Background Readiness

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandGateway.ts`
- Modify: `src/background/coordinator.ts`
- Modify: `src/background/application.ts`
- Modify: `src/background/runtime.ts`
- Modify: `src/background/index.ts`
- Modify: `src/background/routeToolService.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/owlbear/diagnostics.ts`
- Modify: `src/owlbear/notifications.ts`
- Test: `src/commands/commandValidation.test.ts`
- Test: `src/commands/commandGateway.test.ts`
- Test: `src/background/coordinator.test.ts`
- Test: `src/background/application.test.ts`
- Test: `src/background/runtime.test.ts`
- Test: `src/owlbear/notifications.test.ts`
- Test: `src/tests/fourClient.integration.test.ts`

**Interfaces:**
- Produces: `protocolVersion: 2` on command/ACK, `NoCoordinatorError`, explicit `BACKGROUND_NOT_READY`/`NO_COORDINATOR` results.
- Legacy ACK acceptance is restricted to a current pending request from the trusted coordinator event sender.

- [ ] **Step 1: Add failing real-path protocol/lifecycle tests**

```ts
it("accepts a trusted legacy ack for the current pending request", async () => {
  const pending = gateway.send(commandV2("request-1"));
  hub.emitAck("gm-connection", {
    requestId: "request-1", status: "ACCEPTED", coordinatorConnectionId: "gm-connection"
  });
  await expect(pending).resolves.toMatchObject({ protocolVersion: 2, status: "ACCEPTED" });
});

it("rejects an untrusted legacy ack and records its reason", async () => {
  gateway.send(commandV2("request-2"));
  hub.emitAck("attacker", legacyAck("request-2", "attacker"));
  expect(diagnostics.rejections).toContain("UNTRUSTED_COORDINATOR");
});

it("returns NO_COORDINATOR immediately", async () => {
  await expect(gatewayWithoutLeaseOrLiveGm.send(commandV2("r")))
    .rejects.toMatchObject({ name: "NoCoordinatorError" });
});

it("returns PROTOCOL_MISMATCH instead of waiting for an incompatible command", async () => {
  hub.emitCommand("player-connection", { ...commandV2("future"), protocolVersion: 99 });
  await expect(hub.nextAck()).resolves.toMatchObject({
    protocolVersion: 2,
    requestId: "future",
    status: "REJECTED",
    reason: "PROTOCOL_MISMATCH"
  });
});
```

Add an in-memory hub test connecting real gateway, runtime, lease, and production engine. Add cases for failed route cleanup during scene open, dynamic connection ID after reconnect, stale lease expiry/failover, and only elected/current coordinator returning `BACKGROUND_NOT_READY`.

- [ ] **Step 2: Run red tests**

Run: `npm.cmd test -- src/commands/commandGateway.test.ts src/background/coordinator.test.ts src/background/runtime.test.ts src/background/application.test.ts src/tests/fourClient.integration.test.ts src/owlbear/notifications.test.ts`

Expected: FAIL on versioning, legacy compatibility, failover, and readiness.

- [ ] **Step 3: Implement protocol/readiness root-cause fixes**

```ts
export const COMMAND_PROTOCOL_VERSION = 2 as const;

export interface CommandEnvelope {
  protocolVersion: typeof COMMAND_PROTOCOL_VERSION;
  requestId: string;
  senderPlayerId: string;
  senderConnectionId: string;
  expectedRevision: number;
}
```

Resolve the trusted coordinator from a non-expired persisted lease first, then from live GM election. If neither exists, reject before broadcast with `NoCoordinatorError`. ACK validation first finds a pending request and validates `event.connectionId`; a legacy ACK may omit only `protocolVersion` and `recipientConnectionId`, then is normalized to v2. Define an `AckRejectionReason` union for malformed, wrong recipient, wrong sender, protocol mismatch, and stale request, and inject a reporter into `CommandGateway` for diagnostics. A genuine elapsed deadline becomes the only `CommandTimeoutError` path. Unsupported command protocol versions receive a v2 `REJECTED/PROTOCOL_MISMATCH` acknowledgement from the elected background.

Register the command broadcast listener independently of fallible route-tool/session cleanup. Start/refresh the lease even when cleanup fails. Read current connection ID for each heartbeat instead of capturing startup identity, honor `expiresAt`, and let the live next coordinator take over. Only the active persisted coordinator or live-elected next coordinator returns `BACKGROUND_NOT_READY`; all other backgrounds ignore the request. Catch and surface background startup failures in `src/background/index.ts`. Map every new error to a Russian notification.

- [ ] **Step 4: Run green tests and commit**

Run: `npm.cmd test -- src/commands src/background src/tests/fourClient.integration.test.ts src/owlbear/notifications.test.ts && npm.cmd run typecheck`

Expected: PASS with no generic timeout in mixed-version/readiness cases.

Commit: `git commit -am "fix: make command delivery versioned and reliable"`

---

### Task 6: Version 1.2 Asset and Cache-Busted Release Configuration

**Files:**
- Create: `public/icon-1.2.png`
- Delete: `public/icon.svg`
- Modify: `public/manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/background/application.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/app.css`
- Modify: `src/tests/deploymentConfig.test.ts`
- Modify: `README.md`
- Modify: `docs/metadata.md`
- Modify: `docs/manual-four-client-test.md`

**Interfaces:**
- Produces: transparent silhouette-friendly pixel sword PNG without `RP` and versioned public URLs.

- [ ] **Step 1: Add failing deployment assertions**

```ts
expect(manifest.version).toBe("1.2.0");
expect(manifest.manifest_version).toBe(1);
expect(manifest.version).toBe(packageJson.version);
expect(manifest.icon).toMatch(/icon-1\.2\.png$/);
expect(manifest.action.icon).toMatch(/icon-1\.2\.png$/);
expect(manifest.action.popover).toMatch(/index\.html\?v=1\.2\.0$/);
expect(manifest.background_url).toMatch(/background\.html\?v=1\.2\.0$/);
```

Also assert both package-lock version fields equal `1.2.0`; `public/icon-1.2.png` is square, begins with the PNG signature, and declares an alpha-capable PNG color type; no production file references `icon.svg`.

- [ ] **Step 2: Run red test**

Run: `npm.cmd test -- src/tests/deploymentConfig.test.ts`

Expected: FAIL on version, asset, and query strings.

- [ ] **Step 3: Generate/integrate the approved icon and version**

Use the user's sword image as the edit reference and toolbar image as context. Generate a square transparent PNG with the chunky grayscale pixel sword only, remove `RP` and all other text, preserve a bold readable silhouette, then copy it to `public/icon-1.2.png`. Use it in manifest action, route tool, and popover header.

Set package/package-lock/manifest version to `1.2.0`; keep `manifest_version: 1`. Append `?v=1.2.0` to popover/background HTML URLs. Route tool uses `${import.meta.env.BASE_URL}icon-1.2.png`.

- [ ] **Step 4: Run focused tests/build and commit**

Run: `npm.cmd test -- src/tests/deploymentConfig.test.ts src/ui/App.test.tsx src/background/application.test.ts && npm.cmd run build`

Expected: PASS; `dist` contains `icon-1.2.png` and versioned manifest URLs.

Commit: `git add public package*.json src README.md docs && git commit -m "chore: prepare version 1.2 release"`

---

### Task 7: Complete Verification, Review, Merge, and Pages Deployment

**Files:**
- Modify after evidence: `docs/verification-results.md`
- Inspect: every file changed since `91b7ad3`

**Interfaces:**
- Produces: reviewed `main`, green GitHub Pages deployment, and public manifest URL.

- [ ] **Step 1: Add/finish the four-client regression**

The regression must prove: detected enemy remains on map but absent from lists/counters; multi-side member sees the union; player registration and battle rename are rejected; GM rename persists; clamped route commits exact max; old army centres on successful route; mixed legacy ACK resolves; non-coordinator does not emit a conflicting readiness ACK.

Run: `npm.cmd test -- src/tests/fourClient.integration.test.ts`

Expected: PASS.

- [ ] **Step 2: Run final local gate and inspect diff**

Run:

```powershell
npm.cmd run check
git diff 91b7ad3..HEAD --check
git status --short
$diff = git diff 91b7ad3..HEAD
$diff | Select-String -Pattern '(?i)(api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]'
```

Expected: typecheck, lint, all tests, and build pass; diff check and credential scan are empty; only intentional verification documentation may remain.

- [ ] **Step 3: Record evidence and complete code review**

Record exact test-file/test counts, build result, commit ID, and date `2026-07-15` in `docs/verification-results.md`; commit it. Generate a full review package for `91b7ad3..HEAD`, fix every Critical/Important finding, rerun covering tests, then rerun `npm.cmd run check`.

- [ ] **Step 4: Merge and push**

Merge `feat/v1.2` into `main` without discarding the design/plan commits, then run:

```powershell
git push origin main
gh run list --repo minigooser-arch/owlbear-mharmies --limit 1
gh run watch --repo minigooser-arch/owlbear-mharmies --exit-status
```

Expected: push succeeds and newest Pages workflow concludes `success`.

- [ ] **Step 5: Verify public assets**

Request `manifest.json`, `index.html?v=1.2.0`, `background.html?v=1.2.0`, and `icon-1.2.png`. Expected: HTTP 200; public manifest reports `1.2.0`, points at versioned HTML URLs and the new PNG. Report `https://minigooser-arch.github.io/owlbear-mharmies/manifest.json` to the user.

---

## Self-Review

- Spec coverage: Tasks 1–2 cover schema 3, battle naming/rename, list authorization, multi-side membership, and GM-only mutations. Task 3 covers cell-centre snapping, exact maximum clamping, barriers, and physical token centring. Task 4 covers map/interface flicker at both overlay and snapshot boundaries. Task 5 covers the diagnosed mixed-version timeout and lifecycle/election fallbacks. Task 6 covers the supplied visual, version, and cache busting. Task 7 covers integration, review, merge, and live Pages verification.
- Placeholder scan: every requested behavior has named files, a red test, a concrete implementation boundary, a green command, and a commit; no deferred implementation markers remain.
- Type consistency: `BattleGroup.name`, scene version `3`, `mapVisibleSourceIds`, `GridGeometryPort.snapGridCenter`, protocol version `2`, `RENAME_BATTLE_GROUP`, and `icon-1.2.png` use the same names across producers and consumers.
