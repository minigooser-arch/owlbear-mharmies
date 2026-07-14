# Side Leaders, Army Registration, and Route Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make side creation and army registration work in Owlbear Rodeo, add GM-assigned side leaders, and enforce the approved route-editing and route-visibility rules.

**Architecture:** Scene metadata moves to schema v2, while army metadata remains v1 and legacy direct owners are read only for compatibility. All persistent mutations travel through validated command envelopes to the background coordinator; the UI only creates typed payloads, validates the current Owlbear selection for friendly feedback, and awaits acknowledgements. A background-owned Owlbear Tool/ToolMode wraps the existing route controller so it survives popover closure, while local route overlays filter by both side role and army status.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, Testing Library, Owlbear Rodeo SDK 3.1.0, Vite 8, GitHub Actions/Pages.

## Global Constraints

- Leaders are authorized only by Owlbear `Player.id`; display names never participate in authorization.
- A side may have multiple leaders, and one player may belong to or lead multiple sides.
- Every `leaderPlayerIds` entry must also exist in the same side's `playerIds`.
- Only GM may create/delete/rename sides, assign leaders, register/unregister armies, or control movement.
- A leader may only add/remove ordinary members and set/clear routes for sides they lead.
- Any selected Owlbear `IMAGE` may be registered; all other item types and invalid selections are rejected.
- New army registrations contain a side only; `directOwnerPlayerId` remains read-compatible but is ignored by authorization and hidden from UI.
- A `READY` route is visible only to GM and that side's leaders; started routes are visible to GM and all members of that side.
- All user-facing failures in these flows use Russian Owlbear notifications.
- No new backend or runtime dependency is introduced.

---

## File Structure

- `src/shared/types.ts`: schema-v2 side types and typed command payload union.
- `src/shared/validation.ts`: normalize v2 sides while preserving leader/member invariants.
- `src/storage/migrations.ts`: explicit v0/v1 to v2 scene migration.
- `src/shared/permissions.ts`: GM/leader authorization based on internal player IDs.
- `src/commands/commandValidation.ts`: runtime validation for untrusted broadcast payloads.
- `src/commands/commandProcessor.ts`: authoritative side, membership, registration, and route mutations.
- `src/background/application.ts`: sender derivation, malformed-command acknowledgements, persistence, overlay/tool lifecycle.
- `src/owlbear/registration.ts`: pure selected-item validation; no direct metadata mutation.
- `src/owlbear/notifications.ts`: Russian mapping for selection, rejection, conflict, and timeout failures.
- `src/owlbear/extensionServices.ts`: party snapshot, typed UI dispatch, selection resolution, route-tool activation.
- `src/owlbear/routeTool.ts`: route-controller draft snapshot and cancellation.
- `src/owlbear/routeToolIntegration.ts`: SDK Tool/ToolMode lifecycle and event adapter.
- `src/background/routeToolService.ts`: loads authorized route sessions, renders local previews, and submits commands.
- `src/routes/routeOverlayService.ts`: status- and role-aware route filtering.
- `src/ui/state/useExtensionState.ts`: party/player/capability view model.
- `src/ui/pages/SidesPage.tsx`: complete creation form and leader/member controls.
- `src/ui/pages/ArmiesPage.tsx`: GM registration panel using all configured sides.
- `src/ui/components/ArmyCard.tsx`: separate route, movement, and unregister capabilities.
- `src/ui/App.tsx`, `src/ui/app.css`, `src/ui/main.tsx`: wiring, layout, and loading defaults.
- `docs/metadata.md`, `docs/manual-four-client-test.md`, `README.md`: user and schema documentation.

---

### Task 1: Scene Schema v2 and Leader Invariants

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/metadataRepository.ts`
- Modify: `src/owlbear/sdkAdapter.ts`
- Test: `src/shared/validation.test.ts`
- Test: `src/storage/migrations.test.ts`
- Test: `src/storage/metadataRepository.test.ts`

**Interfaces:**
- Consumes: existing `SceneState`, `Side`, `ValidationResult<T>`, and `DEFAULT_SETTINGS`.
- Produces: `Side.leaderPlayerIds: string[]`, `SceneState.version: 2`, and `migrateSceneState(raw): ValidationResult<SceneState>` accepting v0, v1, and v2.

- [ ] **Step 1: Write failing migration and normalization tests**

```ts
it("migrates v1 sides to v2 without losing memberships", () => {
  const result = migrateSceneState({
    version: 1,
    revision: 7,
    settings: DEFAULT_SETTINGS,
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["p1", "p1"] }],
    relations: {},
    battleGroups: []
  });
  expect(result).toEqual({
    ok: true,
    value: expect.objectContaining({
      version: 2,
      revision: 7,
      sides: [{
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["p1"],
        leaderPlayerIds: []
      }]
    })
  });
});

it("normalizes leaders as unique members without crossing side boundaries", () => {
  const result = migrateSceneState({
    version: 2,
    sides: [
      { id: "red", name: "Красные", color: "#f00", playerIds: ["member"], leaderPlayerIds: ["lead", "lead"] },
      { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: ["lead"] }
    ]
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      sides: [
        { id: "red", playerIds: ["member", "lead"], leaderPlayerIds: ["lead"] },
        { id: "blue", playerIds: ["lead"], leaderPlayerIds: ["lead"] }
      ]
    }
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm red**

Run: `npm.cmd test -- src/storage/migrations.test.ts src/shared/validation.test.ts src/storage/metadataRepository.test.ts`

Expected: FAIL because v1 currently normalizes to version 1 and `leaderPlayerIds` is absent.

- [ ] **Step 3: Implement the v2 types and explicit migration chain**

```ts
export interface Side {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  leaderPlayerIds: string[];
}

export interface SceneState {
  version: 2;
  revision: number;
  settings: SceneSettings;
  sides: Side[];
  relations: Record<string, Record<string, SideRelation>>;
  battleGroups: BattleGroup[];
  coordinatorLease?: CoordinatorLease;
}
```

In `normalizeSide`, normalize both arrays, then preserve order while adding leaders to members:

```ts
const playerIds = uniqueStrings(value.playerIds);
const leaderPlayerIds = uniqueStrings(value.leaderPlayerIds);
return {
  id: value.id,
  name: value.name,
  color: value.color,
  playerIds: [...new Set([...playerIds, ...leaderPlayerIds])],
  leaderPlayerIds
};
```

In `migrateSceneState`, reject only versions greater than 2 and upgrade legacy sides before v2 normalization:

```ts
export function migrateSceneState(raw: unknown): ValidationResult<SceneState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 2) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  if (!isRecord(raw)) return normalizeSceneState(raw);
  const v1 = version === 0 ? { ...raw, version: 1 } : raw;
  if (version === 0 || version === 1 || version === undefined) {
    const sides = Array.isArray(v1.sides)
      ? v1.sides.map((side) => isRecord(side) ? { ...side, leaderPlayerIds: [] } : side)
      : [];
    return normalizeSceneState({ ...v1, version: 2, sides });
  }
  return normalizeSceneState(raw);
}
```

Change every new-scene fallback from `{ version: 1 }` to `{ version: 2 }` in the repository, SDK adapter, and extension services. Do not alter `ArmyState.version` or `BarrierState.version`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm.cmd test -- src/storage/migrations.test.ts src/shared/validation.test.ts src/storage/metadataRepository.test.ts && npm.cmd run typecheck`

Expected: PASS; TypeScript reports all remaining v1 scene fixtures that must gain `leaderPlayerIds` and version 2 before Task 1 is committed.

- [ ] **Step 5: Update all scene fixtures and commit**

For every `SceneState` fixture, use this side shape:

```ts
{ id: "red", name: "Красные", color: "#f00", playerIds: ["member"], leaderPlayerIds: [] }
```

Run: `npm.cmd run typecheck && npm.cmd test -- src/shared/validation.test.ts src/storage/migrations.test.ts src/storage/metadataRepository.test.ts`

Expected: PASS.

Commit:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/shared src/storage src/owlbear/sdkAdapter.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'feat: migrate sides to leader schema'
```

---

### Task 2: Internal-ID Authorization and Authoritative Commands

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/permissions.ts`
- Create: `src/commands/commandValidation.ts`
- Modify: `src/commands/commandProcessor.ts`
- Modify: `src/background/application.ts`
- Test: `src/shared/permissions.test.ts`
- Test: `src/commands/commandProcessor.test.ts`
- Test: `src/background/application.test.ts`

**Interfaces:**
- Consumes: schema-v2 `Side[]`, current party `Player.id`, current scene items, and existing command envelope fields.
- Produces: `ArmyCommandPayload`, leadership commands, `validateArmyCommand(value)`, and GM/leader authorization reasons.

- [ ] **Step 1: Write failing authorization and processor tests**

```ts
it("allows leaders to edit own-side routes but never movement", () => {
  const context = {
    role: "PLAYER" as const,
    playerId: "leader-id",
    armies: new Map([["army-red", army("red")]]),
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader-id"], leaderPlayerIds: ["leader-id"] }]
  };
  expect(authorizeArmyCommand(context, command("SET_ROUTE", "leader-id", { armyId: "army-red", route: [] }))).toEqual({ allowed: true });
  expect(authorizeArmyCommand(context, command("START_ARMY", "leader-id", { armyId: "army-red" }))).toEqual({ allowed: false, reason: "GM_ONLY" });
});

it("does not authorize an identical display name or forged player id", () => {
  const result = processor.execute(playerContext("actual-player"), command({
    type: "SET_ROUTE",
    senderPlayerId: "leader-id",
    armyId: "army-red",
    route: [{ x: 1, y: 0 }]
  }));
  expect(result).toEqual({ status: "REJECTED", reason: "FORGED_CONNECTION" });
});

it("keeps leadership assignment GM-only and makes the leader a member", () => {
  const accepted = processor.execute(gmContext(), command({
    type: "ADD_SIDE_LEADER",
    sideId: "red",
    playerId: "leader-2"
  }));
  expect(accepted).toMatchObject({
    status: "ACCEPTED",
    state: { scene: { sides: [{ playerIds: expect.arrayContaining(["leader-2"]), leaderPlayerIds: ["leader-2"] }] } }
  });
});

it("rejects removing a member who is still a leader", () => {
  expect(processor.execute(gmContextWithLeader(), command({
    type: "REMOVE_SIDE_PLAYER",
    sideId: "red",
    playerId: "leader-id"
  }))).toEqual({ status: "REJECTED", reason: "PLAYER_IS_LEADER" });
});
```

- [ ] **Step 2: Run focused tests and confirm red**

Run: `npm.cmd test -- src/shared/permissions.test.ts src/commands/commandProcessor.test.ts src/background/application.test.ts`

Expected: FAIL because authorization still uses `directOwnerPlayerId`, leadership commands do not exist, and item type is not validated.

- [ ] **Step 3: Define typed payloads and implement authorization**

Split the command type in `src/shared/types.ts`:

```ts
export interface CommandEnvelope {
  requestId: string;
  senderPlayerId: string;
  senderConnectionId: string;
  expectedRevision: number;
}

export type ArmyCommandPayload =
  | { type: "REGISTER_ARMY"; itemId: string; sideId: string }
  | { type: "UNREGISTER_ARMY"; armyId: string }
  | { type: "CREATE_SIDE"; side: Side }
  | { type: "ADD_SIDE_PLAYER" | "REMOVE_SIDE_PLAYER" | "ADD_SIDE_LEADER" | "REMOVE_SIDE_LEADER"; sideId: string; playerId: string }
  | { type: "SET_ROUTE"; armyId: string; route: Vector2[] }
  | { type: "CLEAR_ROUTE"; armyId: string }
  | { type: "START_ARMY" | "PAUSE_ARMY" | "RESUME_ARMY" | "STOP_ARMY"; armyId: string }
  | { type: "START_ALL" | "PAUSE_ALL" | "RESUME_ALL" | "STOP_ALL" }
  | { type: "RENAME_SIDE"; sideId: string; name: string }
  | { type: "DELETE_SIDE"; sideId: string; strategy: "REASSIGN_ARMIES" | "UNREGISTER_ARMIES"; targetSideId?: string }
  | { type: "SET_RELATION"; leftSideId: string; rightSideId: string; relation: SideRelation }
  | { type: "UPDATE_SETTINGS"; settings: Partial<SceneSettings> }
  | { type: "UPDATE_ARMY_OVERRIDES"; armyId: string; overrides: ArmyOverrides }
  | { type: "MOVE_ARMY"; armyId: string; position: Vector2 }
  | { type: "CREATE_BARRIER"; itemId: string; barrier: BarrierState }
  | { type: "UPDATE_BARRIER"; itemId: string; barrier: Partial<BarrierState> }
  | { type: "DELETE_BARRIER"; itemId: string }
  | { type: "RELEASE_BATTLE_GROUP"; battleId: string }
  | { type: "REMOVE_BATTLE_PARTICIPANT"; battleId: string; armyId: string };

export type ArmyCommand = CommandEnvelope & ArmyCommandPayload;
```

Implement `AuthorizationContext` with `sides` and no direct-owner/settings gates. For players, allow only member add/remove on a led side and route set/clear for an army whose side they lead; return `GM_ONLY`, `SIDE_NOT_FOUND`, `ARMY_NOT_FOUND`, `NOT_SIDE_LEADER`, or `SENDER_MISMATCH` otherwise.

- [ ] **Step 4: Add runtime command validation and authoritative apply rules**

Export this result from `src/commands/commandValidation.ts`:

```ts
export type CommandValidationResult =
  | { ok: true; command: ArmyCommand }
  | { ok: false; requestId?: string; reason: "INVALID_COMMAND" };

export function validateArmyCommand(value: unknown): CommandValidationResult;
```

Validate base fields, the exact supported `type`, and every required per-type field before casting. In `CommandProcessor`, add `items: Record<string, SceneItemRecord>` to `CommandState` and enforce:

```ts
case "REGISTER_ARMY": {
  const item = state.items[command.itemId];
  if (!item) return "ITEM_NOT_FOUND";
  if (item.type !== "IMAGE") return "IMAGE_REQUIRED";
  if (state.armies[command.itemId] || item.metadata[METADATA_KEYS.army] !== undefined) return "ALREADY_REGISTERED";
  if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
  state.armies[command.itemId] = newArmyState(command.sideId);
  return undefined;
}
case "ADD_SIDE_LEADER":
case "REMOVE_SIDE_LEADER": {
  const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
  if (!side) return "SIDE_NOT_FOUND";
  if (command.type === "ADD_SIDE_LEADER") {
    if (!context.connectedPlayerIds.has(command.playerId)) return "PLAYER_NOT_CONNECTED";
    side.playerIds = [...new Set([...side.playerIds, command.playerId])];
    side.leaderPlayerIds = [...new Set([...side.leaderPlayerIds, command.playerId])];
  } else {
    side.leaderPlayerIds = side.leaderPlayerIds.filter((id) => id !== command.playerId);
  }
  return undefined;
}
```

Pass `context` into `apply` so membership additions can check current party IDs. Reject `REMOVE_SIDE_PLAYER` with `PLAYER_IS_LEADER` while leadership remains.

In `ProductionEngine.processCommand`, validate before reading state, derive sender only from `event.connectionId`, and send a `REJECTED/INVALID_COMMAND` acknowledgement whenever a valid request ID is recoverable. Do not silently discard forged sender fields; let the processor reject them against the derived sender.

- [ ] **Step 5: Run tests, typecheck, and commit**

Run: `npm.cmd test -- src/shared/permissions.test.ts src/commands/commandProcessor.test.ts src/background/application.test.ts && npm.cmd run typecheck`

Expected: PASS, including identical-name, multi-leader, multi-side, malformed payload, wrong item type, duplicate registration, and GM-only movement cases.

Commit:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/shared src/commands src/background/application.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'feat: authorize side leaders by player id'
```

---

### Task 3: Party Snapshot and Side Management UI

**Files:**
- Modify: `src/ui/state/useExtensionState.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/ui/pages/SidesPage.tsx`
- Create: `src/ui/pages/SidesPage.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/App.test.tsx`
- Modify: `src/ui/main.tsx`
- Modify: `src/ui/app.css`

**Interfaces:**
- Consumes: schema-v2 sides, live Owlbear party players, and `ArmyCommandPayload`.
- Produces: `PartyPlayerView`, `memberSideIds`, `leaderSideIds`, complete side commands, and leader-visible side management.

- [ ] **Step 1: Write failing UI tests for side creation and internal IDs**

```tsx
it("submits a complete side and trims its name", async () => {
  const onAction = vi.fn();
  render(<SidesPage
    role="GM"
    playerId="gm"
    sides={[]}
    players={[]}
    createId={() => "side-uuid"}
    onAction={onAction}
  />);
  await userEvent.type(screen.getByLabelText("Название стороны"), "  Красные  ");
  await userEvent.click(screen.getByRole("button", { name: "Добавить сторону" }));
  expect(onAction).toHaveBeenCalledWith({
    type: "CREATE_SIDE",
    side: {
      id: "side-uuid",
      name: "Красные",
      color: "#b3261e",
      playerIds: [],
      leaderPlayerIds: []
    }
  });
});

it("uses player ids when GM assigns two equal display names", async () => {
  renderSideWithPlayers([
    { id: "p-1", name: "Алекс", color: "#111", role: "PLAYER", connected: true },
    { id: "p-2", name: "Алекс", color: "#222", role: "PLAYER", connected: true }
  ]);
  await userEvent.click(screen.getByRole("checkbox", { name: "Лидер Алекс (p-2)" }));
  expect(onAction).toHaveBeenCalledWith({ type: "ADD_SIDE_LEADER", sideId: "red", playerId: "p-2" });
});

it("shows the Sides tab to a leader but not an ordinary member", () => {
  render(<App services={services({ playerId: "leader", leaderSideIds: new Set(["red"]) })} />);
  expect(screen.getByRole("button", { name: "Стороны" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI tests and confirm red**

Run: `npm.cmd test -- src/ui/pages/SidesPage.test.tsx src/ui/App.test.tsx src/ui/state/useExtensionState.test.tsx`

Expected: FAIL because the snapshot has no players/leader sets and the current button emits an incomplete payload.

- [ ] **Step 3: Add typed view-model fields and party refresh**

```ts
export interface PartyPlayerView {
  id: string;
  name: string;
  color: string;
  role: "GM" | "PLAYER";
  connected: boolean;
}

export type UiCommand = ArmyCommandPayload
  | { type: "REGISTER_SELECTED_ARMY"; sideId: string }
  | { type: "EDIT_ROUTE"; armyId: string };

export interface RawExtensionSnapshot {
  ready: boolean;
  sceneReady: boolean;
  futureSchema: boolean;
  role: "GM" | "PLAYER";
  playerId: string;
  players: readonly PartyPlayerView[];
  memberSideIds: ReadonlySet<string>;
  leaderSideIds: ReadonlySet<string>;
  visibleSourceIds: ReadonlySet<string>;
  armies: readonly ArmyView[];
  sides: readonly Side[];
  relations: Readonly<Record<string, Record<string, SideRelation>>>;
  battleGroups: readonly BattleGroup[];
  settings: SceneSettings;
}
```

In `refresh`, read `OBR.party.getPlayers()` plus local `getName/getColor/getId/getRole/getConnectionId`, merge by `id`, and build member/leader side sets from IDs. Remove `directOwnerPlayerId` from `ArmyView`.

- [ ] **Step 4: Implement the side form and capability-aware controls**

Use controlled `name` and `color` fields. Submit only when `name.trim()` is non-empty, with `createId()` defaulting to `crypto.randomUUID`. For each side, render every live player plus persisted missing IDs. GM sees both membership and leadership checkboxes; a leader sees membership checkboxes only on sides in `leaderSideIds`; disable member removal while that ID is still a leader. Label disconnected persisted IDs as `Недоступен: <id>`.

Wire `App` as follows:

```tsx
const canManageSides = state.role === "GM" || state.leaderSideIds.size > 0;
const tabs: Tab[] = state.role === "GM"
  ? ["ARMIES", "SIDES", "RELATIONS", "MOVEMENT", "BATTLES", "SETTINGS", "DIAGNOSTICS"]
  : canManageSides
    ? ["ARMIES", "SIDES", "MOVEMENT", "BATTLES", "DIAGNOSTICS"]
    : ["ARMIES", "MOVEMENT", "BATTLES", "DIAGNOSTICS"];
```

Pass `role`, `playerId`, `players`, and `leaderSideIds` to `SidesPage`. Add form, player-row, unavailable, and disabled-control styles without changing the 460px popover width.

- [ ] **Step 5: Run UI tests and commit**

Run: `npm.cmd test -- src/ui/pages/SidesPage.test.tsx src/ui/App.test.tsx src/ui/state/useExtensionState.test.tsx src/owlbear/extensionServices.test.ts && npm.cmd run typecheck`

Expected: PASS.

Commit:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/ui src/owlbear/extensionServices.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'feat: manage side leaders and members'
```

---

### Task 4: GM Image Registration and Russian Command Feedback

**Files:**
- Rewrite: `src/owlbear/registration.ts`
- Modify: `src/owlbear/registration.test.ts`
- Modify: `src/owlbear/notifications.ts`
- Create: `src/owlbear/notifications.test.ts`
- Modify: `src/commands/commandGateway.ts`
- Modify: `src/commands/commandGateway.test.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/owlbear/extensionServices.test.ts`
- Modify: `src/owlbear/sdkAdapter.ts`
- Modify: `src/ui/pages/ArmiesPage.tsx`
- Create: `src/ui/pages/ArmiesPage.test.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `UiCommand`, scene selection IDs, scene items, sides, and gateway acknowledgements.
- Produces: `resolveRegistrationSelection`, typed gateway timeout, Russian failure mapping, and a GM-only registration panel.

- [ ] **Step 1: Write failing selection and UI tests**

```ts
it.each([
  [[], "SELECTION_EMPTY"],
  [["a", "b"], "SELECTION_MULTIPLE"],
  [["shape"], "IMAGE_REQUIRED"],
  [["army"], "ALREADY_REGISTERED"]
])("rejects invalid registration selection %j", (selection, code) => {
  expect(() => resolveRegistrationSelection({
    selection,
    items: [image("a"), image("b"), shape("shape"), registeredImage("army")]
  })).toThrowError(expect.objectContaining({ code }));
});
```

```tsx
it("shows registration only to GM and submits the selected side", async () => {
  const onAction = vi.fn();
  const { rerender } = render(<ArmiesPage armies={[]} sides={[redSide]} role="PLAYER" playerId="p" leaderSideIds={new Set()} onAction={onAction} />);
  expect(screen.queryByRole("button", { name: "Сделать армией" })).not.toBeInTheDocument();
  rerender(<ArmiesPage armies={[]} sides={[redSide]} role="GM" playerId="gm" leaderSideIds={new Set()} onAction={onAction} />);
  await userEvent.click(screen.getByRole("button", { name: "Сделать армией" }));
  expect(onAction).toHaveBeenCalledWith({ type: "REGISTER_SELECTED_ARMY", sideId: "red" });
});
```

- [ ] **Step 2: Run focused tests and confirm red**

Run: `npm.cmd test -- src/owlbear/registration.test.ts src/owlbear/notifications.test.ts src/owlbear/extensionServices.test.ts src/ui/pages/ArmiesPage.test.tsx`

Expected: FAIL because registration still mutates metadata directly, feedback is incomplete, and the panel does not exist.

- [ ] **Step 3: Replace direct registration with pure selection policy**

```ts
export type RegistrationSelectionErrorCode =
  | "SELECTION_EMPTY"
  | "SELECTION_MULTIPLE"
  | "ITEM_NOT_FOUND"
  | "IMAGE_REQUIRED"
  | "ALREADY_REGISTERED";

export interface RegistrationSelectionInput {
  selection: readonly string[];
  items: readonly SceneItemRecord[];
}

export function resolveRegistrationSelection(input: RegistrationSelectionInput): SceneItemRecord {
  if (input.selection.length === 0) throw new RegistrationError("SELECTION_EMPTY");
  if (input.selection.length !== 1) throw new RegistrationError("SELECTION_MULTIPLE");
  const item = input.items.find((candidate) => candidate.id === input.selection[0]);
  if (!item) throw new RegistrationError("ITEM_NOT_FOUND");
  if (item.type !== "IMAGE") throw new RegistrationError("IMAGE_REQUIRED");
  if (item.metadata[METADATA_KEYS.army] !== undefined) throw new RegistrationError("ALREADY_REGISTERED");
  return item;
}
```

Remove `RegistrationPort` from `OwlbearPort`; persistent registration remains solely in the command processor.

- [ ] **Step 4: Await acknowledgements and translate every failure**

Add a named timeout error:

```ts
export class CommandTimeoutError extends Error {
  constructor(readonly requestId: string) {
    super("Command acknowledgement timed out");
    this.name = "CommandTimeoutError";
  }
}
```

Make `notificationMessage(code: string)` cover at least `GM_ONLY`, `NOT_SIDE_LEADER`, `PLAYER_IS_LEADER`, `PLAYER_NOT_CONNECTED`, `REVISION_CONFLICT`, `COMMAND_TIMEOUT`, `INVALID_COMMAND`, `SELECTION_EMPTY`, `SELECTION_MULTIPLE`, `ITEM_NOT_FOUND`, `IMAGE_REQUIRED`, `ALREADY_REGISTERED`, and `SIDE_NOT_FOUND` with Russian text.

In `extensionServices.send`, intercept `REGISTER_SELECTED_ARMY`, resolve the current selection, dispatch `{ type: "REGISTER_ARMY", itemId, sideId }`, await the ack, show a Russian error for `REJECTED` or `CONFLICT`, show a timeout message for `CommandTimeoutError`, and refresh after `ACCEPTED`. Apply the same ack/error handling to every command.

- [ ] **Step 5: Build the GM panel, test, and commit**

The panel must render a select from `sides`, including sides with zero armies, and a `Сделать армией` button disabled when there are no sides. Pass all sides from `App`. Add an explicit GM-only `UNREGISTER_ARMY` action to army cards in Task 5.

Run: `npm.cmd test -- src/owlbear/registration.test.ts src/owlbear/notifications.test.ts src/commands/commandGateway.test.ts src/owlbear/extensionServices.test.ts src/ui/pages/ArmiesPage.test.tsx && npm.cmd run typecheck`

Expected: PASS.

Commit:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/owlbear src/commands/commandGateway.ts src/ui/pages/ArmiesPage.tsx src/ui/pages/ArmiesPage.test.tsx src/ui/App.tsx
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'feat: register selected image armies'
```

---

### Task 5: Route/Movement Capabilities and Overlay Visibility

**Files:**
- Modify: `src/routes/routeOverlayService.ts`
- Modify: `src/routes/routeOverlayService.test.ts`
- Modify: `src/background/application.ts`
- Modify: `src/ui/components/ArmyCard.tsx`
- Create: `src/ui/components/ArmyCard.test.tsx`
- Modify: `src/ui/pages/ArmiesPage.tsx`
- Modify: `src/ui/pages/MovementPage.tsx`
- Modify: `src/ui/pages/SettingsPage.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/app.css`

**Interfaces:**
- Consumes: `ArmyStatus`, member-side IDs, leader-side IDs, and role.
- Produces: route visibility matrix and separate route/movement/unregister UI capabilities.

- [ ] **Step 1: Write the complete overlay matrix as failing tests**

```ts
it.each([
  ["GM", "READY", true],
  ["LEADER", "READY", true],
  ["MEMBER", "READY", false],
  ["OTHER", "READY", false],
  ["GM", "MOVING", true],
  ["LEADER", "MOVING", true],
  ["MEMBER", "MOVING", true],
  ["OTHER", "MOVING", false],
  ["MEMBER", "PAUSED", true],
  ["MEMBER", "IN_BATTLE", true]
] as const)("filters %s viewer for %s route", async (viewerKind, status, visible) => {
  const port = new MemoryOverlayPort();
  await new RouteOverlayService(port).reconcile(
    [{ armyId: "a", sideId: "red", status, color: "#f00", start: { x: 0, y: 0 }, waypoints: [{ x: 1, y: 0 }] }],
    viewer(viewerKind)
  );
  expect(port.items.length > 0).toBe(visible);
});

it("renders no overlay for an empty route", async () => {
  const port = new MemoryOverlayPort();
  await new RouteOverlayService(port).reconcile(
    [{ armyId: "a", sideId: "red", status: "MOVING", color: "#f00", start: { x: 0, y: 0 }, waypoints: [] }],
    viewer("GM")
  );
  expect(port.items).toEqual([]);
});
```

- [ ] **Step 2: Write failing army-card capability tests**

```tsx
it("gives a leader only route controls", () => {
  render(<ArmyCard army={redArmy} isGM={false} canEditRoute onAction={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Маршрут" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Старт" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Снять регистрацию" })).not.toBeInTheDocument();
});

it("gives GM route, movement, and unregister controls", () => {
  render(<ArmyCard army={redArmy} isGM canEditRoute onAction={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Маршрут" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Старт" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Снять регистрацию" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run focused tests and confirm red**

Run: `npm.cmd test -- src/routes/routeOverlayService.test.ts src/ui/components/ArmyCard.test.tsx src/ui/App.test.tsx`

Expected: FAIL because overlays lack status/leader context and the card still uses direct ownership.

- [ ] **Step 4: Implement filtering and split controls**

```ts
export interface RouteOverlay {
  armyId: string;
  sideId: string;
  status: ArmyStatus;
  color: string;
  start: Vector2;
  waypoints: readonly Vector2[];
}

export interface RouteOverlayViewer {
  isGM: boolean;
  memberSideIds: readonly string[];
  leaderSideIds: readonly string[];
}

function routeVisible(route: RouteOverlay, viewer: RouteOverlayViewer): boolean {
  if (viewer.isGM) return true;
  if (route.status === "READY") return viewer.leaderSideIds.includes(route.sideId);
  return viewer.memberSideIds.includes(route.sideId);
}
```

Filter empty `waypoints` before item creation. Pass `state.status`, member-side IDs, and leader-side IDs from `ProductionEngine.visibilityTick`.

Change `ArmyCard` props to `{ army, isGM, canEditRoute, onAction }`. Render route controls when `canEditRoute`; movement and unregister only when `isGM`. Remove the owner row. Compute `canEditRoute = role === "GM" || leaderSideIds.has(army.sideId)` in `ArmiesPage`. Keep global movement controls GM-only and hide the obsolete player-route/player-start settings from `SettingsPage` while retaining legacy settings fields in metadata.

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test -- src/routes/routeOverlayService.test.ts src/ui/components/ArmyCard.test.tsx src/ui/App.test.tsx src/background/application.test.ts && npm.cmd run typecheck`

Expected: PASS.

Commit:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/routes src/background/application.ts src/ui
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'feat: enforce private planned routes'
```

---

### Task 6: Background-Owned Owlbear Route Tool

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/owlbear/routeTool.ts`
- Modify: `src/owlbear/routeTool.test.ts`
- Create: `src/owlbear/routeToolIntegration.ts`
- Create: `src/owlbear/routeToolIntegration.test.ts`
- Create: `src/background/routeToolService.ts`
- Create: `src/background/routeToolService.test.ts`
- Modify: `src/background/application.ts`
- Modify: `src/owlbear/extensionServices.ts`
- Modify: `src/owlbear/extensionServices.test.ts`

**Interfaces:**
- Consumes: Owlbear SDK 3.1.0 Tool API, route controller, metadata repository, barrier geometry, grid distance, and command gateway.
- Produces: persistent Tool/ToolMode registration, local draft previews, typed activation, and `SET_ROUTE` on Enter.

- [ ] **Step 1: Write failing controller and SDK lifecycle tests**

```ts
it("exposes a defensive draft snapshot and cancels late previews", async () => {
  const deferred = deferredDistance();
  const controller = new RouteToolController(deferred.port);
  controller.activate("army-a", { x: 0, y: 0 }, 5, []);
  const moving = controller.move({ x: 2, y: 0 });
  controller.cancel();
  deferred.resolve(2);
  await moving;
  expect(controller.snapshot()).toBeUndefined();
});

it("registers and removes one tool and mode", async () => {
  const api = new FakeToolApi();
  const cleanup = await registerRouteTool(api, fakePort(), distancePort, "/icon.svg");
  expect(api.tools).toHaveLength(1);
  expect(api.modes).toHaveLength(1);
  await cleanup();
  expect(api.removed).toEqual([ROUTE_TOOL_MODE_ID, ROUTE_TOOL_ID]);
});

it("commits exactly once on non-repeated Enter and cleans the preview", async () => {
  const fixture = await activeRouteTool();
  await fixture.mode.onToolClick?.(fixture.context, toolEvent(1, 0));
  fixture.mode.onKeyDown?.(fixture.context, keyEvent("Enter", false));
  fixture.mode.onKeyDown?.(fixture.context, keyEvent("Enter", true));
  await fixture.flush();
  expect(fixture.port.commits).toEqual([{ armyId: "army-a", route: [{ x: 1, y: 0 }] }]);
  expect(fixture.port.clearCount).toBe(1);
});
```

- [ ] **Step 2: Run focused tests and confirm red**

Run: `npm.cmd test -- src/owlbear/routeTool.test.ts src/owlbear/routeToolIntegration.test.ts src/background/routeToolService.test.ts src/owlbear/extensionServices.test.ts`

Expected: FAIL because controller snapshot/cancel and production Tool/ToolMode integration do not exist.

- [ ] **Step 3: Extend the controller and define SDK constants**

```ts
export const ROUTE_TOOL_ID = `${EXTENSION_ID}/route-tool`;
export const ROUTE_TOOL_MODE_ID = `${ROUTE_TOOL_ID}/draw`;
export const ROUTE_ARMY_ID_KEY = `${ROUTE_TOOL_ID}/army-id`;
export const ROUTE_RETURN_TOOL_KEY = `${ROUTE_TOOL_ID}/return-tool`;
```

Add `METADATA_KEYS.routePreview`. Add these controller methods:

```ts
export interface RouteToolSnapshot {
  armyId: string;
  start: Vector2;
  points: readonly Vector2[];
  preview?: RoutePreview;
}

snapshot(): RouteToolSnapshot | undefined {
  if (!this.armyId) return undefined;
  return {
    armyId: this.armyId,
    start: { ...this.start },
    points: this.points.map((point) => ({ ...point })),
    ...(this.currentPreview ? { preview: structuredClone(this.currentPreview) } : {})
  };
}

cancel(): void {
  this.deactivate();
}
```

- [ ] **Step 4: Implement Tool/ToolMode integration and background route service**

Export the exact integration boundary:

```ts
export interface RouteToolSession {
  armyId: string;
  start: Vector2;
  maxCells: number;
  barriers: readonly BarrierSegment[];
}

export interface RouteToolIntegrationPort {
  loadSession(armyId: string): Promise<RouteToolSession>;
  commitRoute(armyId: string, route: readonly Vector2[]): Promise<void>;
  renderPreview(snapshot: RouteToolSnapshot): Promise<void>;
  clearPreview(): Promise<void>;
  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
  restoreTool(toolId: string): Promise<void>;
}

export async function registerRouteTool(
  api: RouteToolApi,
  port: RouteToolIntegrationPort,
  distancePort: GridDistancePort,
  iconUrl: string
): Promise<() => Promise<void>>;
```

Create one tool and one mode. `onActivate` reads `ROUTE_ARMY_ID_KEY` and `ROUTE_RETURN_TOOL_KEY` from context metadata, loads the authorized session, and activates the controller. Queue `onToolMove` at a maximum of 12 Hz, await `onToolClick` and return `false`, handle `Backspace`, `Enter`, and `Escape`, ignore repeated Enter, clear preview on cancellation/deactivation, and restore the prior tool after commit/cancel.

`RouteToolService.loadSession` must load the current player ID/role, scene, army, and movement barriers; authorize with the same GM-or-side-leader rule; use the army override or scene default maximum; and skip barriers when the army ignores them. `commitRoute` re-loads and re-authorizes the session, then sends `SET_ROUTE` through a background `CommandGateway` with the current revision. Render previews as local curve/label items carrying only `METADATA_KEYS.routePreview`; clear only those items.

In `startBackgroundApplication`, start the route gateway and await `registerRouteTool`; stop the gateway and remove mode/tool during application cleanup. Include route previews in scene-close local cleanup.

In `extensionServices.send`, replace the `EDIT_ROUTE` notification with this order:

```ts
const returnToolId = await OBR.tool.getActiveTool();
await OBR.tool.setMetadata(ROUTE_TOOL_ID, {
  [ROUTE_ARMY_ID_KEY]: command.armyId,
  [ROUTE_RETURN_TOOL_KEY]: returnToolId
});
await OBR.tool.activateTool(ROUTE_TOOL_ID);
await OBR.tool.activateMode(ROUTE_TOOL_ID, ROUTE_TOOL_MODE_ID);
```

- [ ] **Step 5: Run tests and commit**

Run: `npm.cmd test -- src/owlbear/routeTool.test.ts src/owlbear/routeToolIntegration.test.ts src/background/routeToolService.test.ts src/owlbear/extensionServices.test.ts src/background/application.test.ts && npm.cmd run typecheck`

Expected: PASS, including activation, 12 Hz move coalescing, preview cleanup, Enter, Backspace, Escape, repeated keys, rejection feedback, and lifecycle teardown.

Commit:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/shared/constants.ts src/owlbear src/background
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'feat: connect route tool to owlbear'
```

---

### Task 7: Four-Client Integration and Documentation

**Files:**
- Modify: `src/tests/helpers/factories.ts`
- Modify: `src/tests/fourClient.integration.test.ts`
- Modify: `README.md`
- Modify: `docs/metadata.md`
- Modify: `docs/manual-four-client-test.md`
- Modify: `docs/verification-results.md`

**Interfaces:**
- Consumes: all Task 1-6 public interfaces.
- Produces: one end-to-end regression covering GM, two leaders, member, other side, registration, planned route privacy, and started route visibility.

- [ ] **Step 1: Write the failing multi-client regression**

```ts
it("supports leaders, registration, private planning, and started-side visibility", async () => {
  const room = fourClientRoom();
  await room.gm.send(addLeader("red", "leader-1"));
  await room.gm.send(addLeader("red", "leader-2"));
  await room.leader1.send(addMember("red", "member"));
  await room.gm.send(registerArmy("red-token", "red"));
  await room.leader2.send(setRoute("red-token", [{ x: 2, y: 0 }]));

  expect(await room.gm.routeIds()).toContain("red-token");
  expect(await room.leader1.routeIds()).toContain("red-token");
  expect(await room.member.routeIds()).not.toContain("red-token");
  expect(await room.other.routeIds()).not.toContain("red-token");

  await room.gm.send(startArmy("red-token"));
  expect(await room.member.routeIds()).toContain("red-token");
  expect(await room.other.routeIds()).not.toContain("red-token");
});
```

- [ ] **Step 2: Run the integration test and confirm red if any seam remains**

Run: `npm.cmd test -- src/tests/fourClient.integration.test.ts`

Expected: PASS if Tasks 1-6 are fully wired; otherwise FAIL at the missing production seam, which must be corrected before documentation.

- [ ] **Step 3: Update fixtures and documentation with exact behavior**

Document:

```md
- Only the GM can appoint leaders or register an army.
- To register: select exactly one Image token, choose its side, then press **Сделать армией**.
- A leader may manage ordinary members and plan routes for every side they lead.
- Leaders cannot start, pause, resume, or stop movement.
- A planned route is private to the GM and side leaders until the GM starts that army.
```

In `docs/metadata.md`, record scene schema version 2 and `leaderPlayerIds`, plus the legacy-read-only treatment of `directOwnerPlayerId`. In the manual checklist, require two distinct player IDs that may share the same display name.

- [ ] **Step 4: Run the complete local gate**

Run: `npm.cmd run check`

Expected: typecheck, ESLint, every Vitest test, and Vite production build all exit 0; generated `dist/manifest.json` points to `https://minigooser-arch.github.io/owlbear-mharmies/`.

- [ ] **Step 5: Commit verified docs and integration coverage**

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add src/tests README.md docs
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'test: verify side leader workflow'
```

---

### Task 8: Final Review, Push, and GitHub Pages Verification

**Files:**
- Inspect: all files changed since commit `42655b4`
- Update after evidence: `docs/verification-results.md`

**Interfaces:**
- Consumes: green local gate, GitHub repository authentication, and existing Pages workflow.
- Produces: pushed `main`, successful Pages workflow, and publicly reachable updated manifest/assets.

- [ ] **Step 1: Review the full diff and scan forbidden legacy behavior**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' diff 42655b4..HEAD --check
rg -n 'directOwnerPlayerId|allowPlayersToStartOwnArmies|allowPlayersToCreateRoutes' src/ui src/shared/permissions.ts src/commands/commandProcessor.ts
rg -n 'type:\s*"CREATE_SIDE"' src/ui
```

Expected: `git diff --check` is empty; direct owner appears only in legacy metadata parsing/tests; obsolete settings are absent from authorization/UI; every UI `CREATE_SIDE` includes `side`.

- [ ] **Step 2: Run the final verification gate from a clean build**

Run: `npm.cmd run check`

Expected: exit 0 for typecheck, lint, tests, and build.

- [ ] **Step 3: Record exact local evidence and commit it**

Write the observed test count, build result, date `2026-07-14`, and public base URL into `docs/verification-results.md`, then run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add docs/verification-results.md
& 'C:\Program Files\Git\cmd\git.exe' commit -m 'docs: record side leader verification'
```

- [ ] **Step 4: Push main and wait for Pages**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' push origin main
& 'C:\Program Files\GitHub CLI\gh.exe' run list --repo minigooser-arch/owlbear-mharmies --workflow pages.yml --limit 1
& 'C:\Program Files\GitHub CLI\gh.exe' run watch --repo minigooser-arch/owlbear-mharmies --exit-status
```

Expected: push succeeds and the newest Pages workflow concludes `success`.

- [ ] **Step 5: Verify public HTTPS assets**

Run:

```powershell
$manifest = Invoke-WebRequest 'https://minigooser-arch.github.io/owlbear-mharmies/manifest.json' -UseBasicParsing
$index = Invoke-WebRequest 'https://minigooser-arch.github.io/owlbear-mharmies/index.html' -UseBasicParsing
$background = Invoke-WebRequest 'https://minigooser-arch.github.io/owlbear-mharmies/background.html' -UseBasicParsing
$manifest.StatusCode
$index.StatusCode
$background.StatusCode
$manifest.Content
```

Expected: all three status codes are 200 and the manifest still declares the same action/background URLs. Report the manifest URL to the user and clearly separate automated verification from the remaining live Owlbear room checklist.

---

## Self-Review

- Spec coverage: Tasks 1-2 cover schema, invariants, internal-ID authorization, multiple leaders, multi-side membership, forged payloads, and malformed acknowledgements. Tasks 3-5 cover complete side commands, member/leader UI, GM Image registration, command feedback, separate movement permissions, and planned/started visibility. Task 6 covers production route-tool activation and cleanup. Tasks 7-8 cover four-client behavior and deployment.
- Placeholder scan: the plan contains no deferred implementation markers; each production interface and each required behavior is assigned to a concrete task and test command.
- Type consistency: `Side.leaderPlayerIds`, `ArmyCommandPayload`, `PartyPlayerView`, `memberSideIds`, `leaderSideIds`, `RouteOverlay.status`, `RouteToolSnapshot`, `RouteToolSession`, and route-tool constants use the same names across producer and consumer tasks.
