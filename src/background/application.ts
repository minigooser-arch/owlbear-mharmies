import { applyCollision } from "../battles/battleGroupService";
import { findEarliestEnemyCollision } from "../battles/collisionEngine";
import { segmentsFromPolyline, type BarrierSegment } from "../barriers/barrierGeometry";
import { BarrierOverlayService } from "../barriers/barrierOverlayService";
import {
  CommandGateway,
  type BroadcastEvent,
  type CommandAck
} from "../commands/commandGateway";
import { CommandProcessor, type CommandState } from "../commands/commandProcessor";
import { validateArmyCommand } from "../commands/commandValidation";
import { advanceArmy } from "../movement/movementEngine";
import { GridDistanceService } from "../grid/gridDistance";
import { RouteOverlayService } from "../routes/routeOverlayService";
import {
  registerRouteTool,
  type RouteToolRegistration
} from "../owlbear/routeToolIntegration";
import {
  RouteToolService,
  snapRouteToGrid,
  validateRouteConstraints
} from "./routeToolService";
import { METADATA_KEYS } from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyState,
  type BattleGroup,
  type SceneItemRecord,
  type SceneState,
  type SideRelation,
  type Vector2
} from "../shared/types";
import { MetadataRepository, type ArmyRecord, type BarrierRecord } from "../storage/metadataRepository";
import { buildDetectionGraph } from "../visibility/detectionGraph";
import { LocalCloneReconciler, UpdateOriginGuard } from "../visibility/localCloneReconciler";
import { visibleArmyIdsForPlayer } from "../visibility/visibilityEngine";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import {
  CoordinatorLease,
  resolveCoordinatorConnectionId,
  type CoordinatorParticipant,
  type HeartbeatLease
} from "./coordinator";
import { BackgroundRuntime, type BackgroundRuntimePort } from "./runtime";

type BarrierPurpose = "movement" | "vision";

type CommandAckPayload = Omit<CommandAck, "protocolVersion">;

export function sendCommandAck(
  port: Pick<OwlbearPort, "send">,
  acknowledgement: CommandAckPayload
): Promise<void> {
  return port.send(CommandGateway.ACK_CHANNEL, {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    ...acknowledgement
  });
}

export interface ConnectedParticipant {
  id: string;
  connectionId: string;
  role: "GM" | "PLAYER";
}

export interface BackgroundCommandDispatchInput {
  event: BroadcastEvent;
  participants: readonly ConnectedParticipant[];
  currentConnectionId: string;
  lease: HeartbeatLease | undefined;
  now: number;
  ready: boolean;
  active: boolean;
  sendAck(acknowledgement: CommandAckPayload): Promise<void>;
  process(sender: CommandSender): Promise<void>;
}

function recoverRequestId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const requestId = (value as Record<string, unknown>).requestId;
  return typeof requestId === "string" && requestId.trim().length > 0
    ? requestId
    : undefined;
}

function commandProtocol(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>).protocolVersion;
}

export async function dispatchBackgroundCommand(
  input: BackgroundCommandDispatchInput
): Promise<void> {
  const sender = input.participants.find(
    (participant) => participant.connectionId === input.event.connectionId
  );
  if (!sender) return;
  const authoritativeConnectionId = resolveCoordinatorConnectionId(
    input.participants.map(({ connectionId, role }) => ({ connectionId, role })),
    input.lease,
    input.now
  );
  if (authoritativeConnectionId !== input.currentConnectionId) return;
  const requestId = recoverRequestId(input.event.data);
  if (!requestId) return;
  if (commandProtocol(input.event.data) !== COMMAND_PROTOCOL_VERSION) {
    await input.sendAck({
      requestId,
      status: "REJECTED",
      reason: "PROTOCOL_MISMATCH",
      coordinatorConnectionId: input.currentConnectionId,
      recipientConnectionId: sender.connectionId
    });
    return;
  }
  if (!input.ready || !input.active) {
    await input.sendAck({
      requestId,
      status: "REJECTED",
      reason: "BACKGROUND_NOT_READY",
      coordinatorConnectionId: input.currentConnectionId,
      recipientConnectionId: sender.connectionId
    });
    return;
  }
  await input.process({
    role: sender.role,
    playerId: sender.id,
    connectionId: sender.connectionId,
    connectedPlayerIds: new Set(input.participants.map((participant) => participant.id))
  });
}

export class SceneWorkTracker {
  private readonly pending = new Set<Promise<void>>();

  track(work: Promise<unknown>): void {
    const tracked = work.then(() => undefined).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    void tracked.catch(() => undefined);
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }
}

export function mergeCurrentParticipant(
  party: readonly ConnectedParticipant[],
  current: ConnectedParticipant
): ConnectedParticipant[] {
  return [
    ...party.filter(
      (player) => player.id !== current.id && player.connectionId !== current.connectionId
    ),
    current
  ];
}

function curvePoints(item: SceneItemRecord): Vector2[] {
  if (!Array.isArray(item.points)) return [];
  return item.points.filter((point): point is Vector2 => {
    if (typeof point !== "object" || point === null) return false;
    const candidate = point as Record<string, unknown>;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  });
}

export function localOverlayIds(items: readonly SceneItemRecord[]): string[] {
  const keys = [
    METADATA_KEYS.localClone,
    METADATA_KEYS.routeOverlay,
    METADATA_KEYS.routePreview,
    METADATA_KEYS.barrierOverlay
  ];
  return items
    .filter((item) => keys.some((key) => item.metadata[key] !== undefined))
    .map((item) => item.id);
}

export function extractBarrierSegments(
  records: readonly BarrierRecord[],
  purpose: BarrierPurpose
): BarrierSegment[] {
  return records.flatMap((record) => {
    const enabled = purpose === "movement" ? record.state.blocksMovement : record.state.blocksVision;
    return enabled ? segmentsFromPolyline(record.item.id, curvePoints(record.item)) : [];
  });
}

function relation(scene: SceneState, left: string, right: string): SideRelation {
  return scene.relations[left]?.[right] ?? "NEUTRAL";
}

function cloneArmyState(state: ArmyState, patch: Partial<ArmyState>): ArmyState {
  return { ...state, ...patch, revision: state.revision + 1 };
}

export interface CommandSender {
  role: "GM" | "PLAYER";
  playerId: string;
  connectionId: string;
  connectedPlayerIds: ReadonlySet<string>;
}

interface AppliedMetadataWrite {
  itemId: string;
  key: string;
  previousValue: unknown | undefined;
  rollbackUpdate: Record<string, unknown>;
  expectedRevision: number | null;
}

export class ProductionEngine {
  private readonly repository: MetadataRepository;
  private readonly grid: GridDistanceService;
  private readonly cloneReconciler: LocalCloneReconciler;
  private coordinator = false;
  private coordinatorGeneration = 0;
  private activeCoordinatorConnectionId: string | undefined;
  private lastMovementAt = performance.now();
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly port: OwlbearPort) {
    this.repository = new MetadataRepository(port);
    this.grid = new GridDistanceService(port);
    this.cloneReconciler = new LocalCloneReconciler(port, new UpdateOriginGuard());
  }

  setCoordinator(active: boolean, connectionId?: string): void {
    this.coordinatorGeneration += 1;
    this.coordinator = active;
    this.activeCoordinatorConnectionId = active ? connectionId : undefined;
    if (active) this.lastMovementAt = performance.now();
  }

  isCoordinator(): boolean {
    return this.coordinator;
  }

  async readCoordinatorLease(): Promise<HeartbeatLease | undefined> {
    return (await this.repository.readScene()).coordinatorLease;
  }

  private captureCoordinatorGuard(expectedConnectionId = this.activeCoordinatorConnectionId): () => boolean {
    const generation = this.coordinatorGeneration;
    return () =>
      this.coordinator &&
      this.coordinatorGeneration === generation &&
      this.activeCoordinatorConnectionId === expectedConnectionId;
  }

  async visibilityTick(role: "GM" | "PLAYER", playerId: string): Promise<void> {
    const [scene, armies, barriers] = await Promise.all([
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers()
    ]);
    const graph = await buildDetectionGraph({
      mode: scene.settings.detectionMode,
      armies: armies.map(({ item, state }) => ({
        id: item.id,
        sideId: state.sideId,
        position: item.position,
        detectionRangeCells:
          state.overrides.detectionRangeCells ?? scene.settings.defaultDetectionRangeCells,
        ignoresVisionBarriers: state.ignoresVisionBarriers
      })),
      distancePort: this.grid,
      visionBarriers: extractBarrierSegments(barriers, "vision")
    });
    const memberSideIds = scene.sides
      .filter((side) => side.playerIds.includes(playerId))
      .map((side) => side.id);
    const leaderSideIds = scene.sides
      .filter((side) => side.leaderPlayerIds.includes(playerId))
      .map((side) => side.id);
    const visible = visibleArmyIdsForPlayer({
      isGM: role === "GM",
      playerSideIds: memberSideIds,
      armies: armies.map(({ item, state }) => ({ id: item.id, sideId: state.sideId })),
      detectionGraph: graph,
      battleGroups: scene.battleGroups
    });
    await this.cloneReconciler.reconcile(visible, armies.map((record) => record.item));
    await this.reconcileOverlays(scene, armies, barriers, role, memberSideIds, leaderSideIds);
  }

  movementTick(): Promise<void> {
    return this.enqueueMutation(() => this.movementTickNow());
  }

  private async movementTickNow(): Promise<void> {
    if (!this.coordinator) return;
    const expectedCoordinatorConnectionId = this.activeCoordinatorConnectionId;
    const canCommit = this.captureCoordinatorGuard(expectedCoordinatorConnectionId);
    const now = performance.now();
    const deltaSeconds = Math.max(0, (now - this.lastMovementAt) / 1_000);
    this.lastMovementAt = now;
    const [scene, armies, barriers] = await Promise.all([
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers()
    ]);
    const moving = armies.filter((record) => record.state.status === "MOVING");
    if (moving.length === 0) return;
    const movementBarriers = extractBarrierSegments(barriers, "movement");
    const frames: Array<{
      record: ArmyRecord;
      from: Vector2;
      to: Vector2;
      state: ArmyState;
    }> = [];
    for (const record of moving) {
      const result = await advanceArmy({
        position: record.item.position,
        waypoints: record.state.route,
        currentWaypointIndex: record.state.currentWaypointIndex,
        segmentProgressCells: record.state.segmentProgressCells,
        speedCellsPerSecond:
          record.state.overrides.speedCellsPerSecond ?? scene.settings.defaultSpeedCellsPerSecond,
        deltaSeconds,
        distancePort: this.grid,
        movementBarriers,
        ignoresMovementBarriers: record.state.ignoresMovementBarriers
      });
      frames.push({
        record,
        from: { ...record.item.position },
        to: result.position,
        state: cloneArmyState(record.state, {
          status: result.status,
          currentWaypointIndex: result.currentWaypointIndex,
          segmentProgressCells: result.segmentProgressCells,
          ...(result.stopReason ? { stopReason: result.stopReason } : {})
        })
      });
    }

    const collision = await findEarliestEnemyCollision({
      armies: frames.map((frame) => ({
        id: frame.record.item.id,
        sideId: frame.record.state.sideId,
        from: frame.from,
        to: frame.to,
        collisionRangeCells:
          frame.record.state.overrides.collisionRangeCells ?? scene.settings.defaultCollisionRangeCells
      })),
      relationForSides: (left, right) => relation(scene, left, right),
      distancePort: this.grid
    });

    let battleGroups: BattleGroup[] | undefined;
    if (collision) {
      battleGroups = applyCollision(scene.battleGroups, collision, () => crypto.randomUUID());
      const group = battleGroups.find((candidate) =>
        candidate.participantIds.includes(collision.armyAId)
      );
      for (const frame of frames) {
        if (frame.record.item.id === collision.armyAId) {
          frame.to = collision.positionA;
          frame.state = cloneArmyState(frame.state, {
            status: "IN_BATTLE",
            ...(group ? { battleGroupId: group.battleId } : {})
          });
        }
        if (frame.record.item.id === collision.armyBId) {
          frame.to = collision.positionB;
          frame.state = cloneArmyState(frame.state, {
            status: "IN_BATTLE",
            ...(group ? { battleGroupId: group.battleId } : {})
          });
        }
      }
    }

    for (const frame of frames) {
      if (!canCommit()) return;
      await this.port.patchSceneItemMetadata(
        frame.record.item.id,
        METADATA_KEYS.army,
        frame.state,
        { position: frame.to },
        frame.record.state.revision
      );
    }
    if (battleGroups) {
      if (!canCommit()) return;
      await this.repository.writeScene(
        { ...scene, revision: scene.revision + 1, battleGroups },
        scene.revision,
        (current) =>
          canCommit() &&
          (expectedCoordinatorConnectionId === undefined ||
            current.coordinatorLease?.connectionId === expectedCoordinatorConnectionId)
      );
    }
  }

  pauseMovingArmies(): Promise<void> {
    return this.enqueueMutation(() => this.pauseMovingArmiesNow());
  }

  private async pauseMovingArmiesNow(): Promise<void> {
    const armies = await this.repository.readArmies();
    for (const record of armies) {
      if (record.state.status !== "MOVING") continue;
      await this.port.patchSceneItemMetadata(
        record.item.id,
        METADATA_KEYS.army,
        cloneArmyState(record.state, {
          status: "PAUSED",
          stopReason: "COORDINATOR_GAP"
        }),
        {},
        record.state.revision
      );
    }
  }

  processCommand(event: BroadcastEvent, sender: CommandSender): Promise<void> {
    return this.enqueueMutation(() => this.processCommandNow(event, sender));
  }

  private async processCommandNow(event: BroadcastEvent, sender: CommandSender): Promise<void> {
    if (!this.coordinator) return;
    const validation = validateArmyCommand(event.data);
    if (!validation.ok) {
      if (validation.requestId) {
        await sendCommandAck(this.port, {
          requestId: validation.requestId,
          status: "REJECTED",
          reason: validation.reason,
          coordinatorConnectionId: await this.currentConnectionId(),
          recipientConnectionId: sender.connectionId
        });
      }
      return;
    }
    const command = validation.command;
    const [scene, armyRecords, barrierRecords, sceneItems] = await Promise.all([
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers(),
      this.port.getSceneItems()
    ]);
    const commandState: CommandState = {
      scene,
      armies: Object.fromEntries(armyRecords.map((record) => [record.item.id, record.state])),
      barriers: Object.fromEntries(barrierRecords.map((record) => [record.item.id, record.state])),
      items: Object.fromEntries(sceneItems.map((item) => [item.id, item])),
      positions: Object.fromEntries(sceneItems.map((item) => [item.id, item.position]))
    };
    const result = new CommandProcessor().execute(
      {
        role: sender.role,
        playerId: sender.playerId,
        connectionId: sender.connectionId,
        connectedPlayerIds: sender.connectedPlayerIds,
        state: commandState
      },
      command
    );
    const coordinatorConnectionId = await this.currentConnectionId();
    if (result.status === "ACCEPTED" && command.type === "REGISTER_ARMY") {
      const item = sceneItems.find((candidate) => candidate.id === command.itemId);
      if (item) {
        try {
          result.state.positions ??= {};
          result.state.positions[command.itemId] = await this.grid.snapGridCenter(item.position);
        } catch {
          await sendCommandAck(this.port, {
            requestId: command.requestId,
            status: "REJECTED",
            reason: "PERSISTENCE_FAILED",
            coordinatorConnectionId,
            recipientConnectionId: sender.connectionId
          });
          return;
        }
      }
    }
    if (result.status === "ACCEPTED" && command.type === "SET_ROUTE") {
      const army = armyRecords.find((record) => record.item.id === command.armyId);
      if (army) {
        let snapped: Awaited<ReturnType<typeof snapRouteToGrid>>;
        try {
          snapped = await snapRouteToGrid(army.item.position, command.route, this.grid);
        } catch {
          await sendCommandAck(this.port, {
            requestId: command.requestId,
            status: "REJECTED",
            reason: "PERSISTENCE_FAILED",
            coordinatorConnectionId,
            recipientConnectionId: sender.connectionId
          });
          return;
        }
        if (!snapped.waypointsWereCentered) {
          await sendCommandAck(this.port, {
            requestId: command.requestId,
            status: "REJECTED",
            reason: "INVALID_COMMAND",
            coordinatorConnectionId,
            recipientConnectionId: sender.connectionId
          });
          return;
        }
        let failure: Awaited<ReturnType<typeof validateRouteConstraints>>;
        try {
          failure = await validateRouteConstraints(
            snapped.start,
            snapped.route,
            army.state.overrides.maxRouteDistanceCells ??
              scene.settings.defaultMaxRouteDistanceCells,
            army.state.ignoresMovementBarriers
              ? []
              : extractBarrierSegments(barrierRecords, "movement"),
            this.grid
          );
        } catch {
          await sendCommandAck(this.port, {
            requestId: command.requestId,
            status: "REJECTED",
            reason: "PERSISTENCE_FAILED",
            coordinatorConnectionId,
            recipientConnectionId: sender.connectionId
          });
          return;
        }
        if (failure) {
          await sendCommandAck(this.port, {
            requestId: command.requestId,
            status: "REJECTED",
            reason: failure,
            coordinatorConnectionId,
            recipientConnectionId: sender.connectionId
          });
          return;
        }
        const nextArmy = result.state.armies[command.armyId];
        if (nextArmy) nextArmy.route = snapped.route;
        result.state.positions ??= {};
        result.state.positions[command.armyId] = snapped.start;
      }
    }
    if (result.status === "ACCEPTED") {
      const commitScene = await this.repository.readScene();
      const leaseMatches = this.activeCoordinatorConnectionId === undefined ||
        commitScene.coordinatorLease?.connectionId === this.activeCoordinatorConnectionId;
      if (
        !this.coordinator ||
        !leaseMatches ||
        commitScene.revision !== commandState.scene.revision
      ) {
        await sendCommandAck(this.port, {
          requestId: command.requestId,
          status: "CONFLICT",
          actualRevision: commitScene.revision,
          coordinatorConnectionId,
          recipientConnectionId: sender.connectionId
        });
        return;
      }
      try {
        await this.persistCommandState(result.state, commandState, sceneItems);
      } catch {
        await sendCommandAck(this.port, {
          requestId: command.requestId,
          status: "REJECTED",
          reason: "PERSISTENCE_FAILED",
          coordinatorConnectionId,
          recipientConnectionId: sender.connectionId
        });
        return;
      }
      await sendCommandAck(this.port, {
        requestId: command.requestId,
        status: "ACCEPTED",
        coordinatorConnectionId,
        recipientConnectionId: sender.connectionId
      });
    } else {
      await sendCommandAck(this.port, {
        requestId: command.requestId,
        status: result.status,
        coordinatorConnectionId,
        recipientConnectionId: sender.connectionId,
        ...(result.status === "REJECTED" ? { reason: result.reason } : { actualRevision: result.actualRevision })
      });
    }
  }

  private async currentConnectionId(): Promise<string> {
    if (this.activeCoordinatorConnectionId) return this.activeCoordinatorConnectionId;
    const raw = (await this.repository.readScene()).coordinatorLease?.connectionId;
    return raw ?? "";
  }

  private async persistCommandState(
    next: CommandState,
    previous: CommandState,
    items: readonly SceneItemRecord[]
  ): Promise<void> {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const applied: AppliedMetadataWrite[] = [];
    const expectedCoordinatorConnectionId = this.activeCoordinatorConnectionId;
    const canCommit = this.captureCoordinatorGuard(expectedCoordinatorConnectionId);
    try {
      const armyIds = new Set([...Object.keys(previous.armies), ...Object.keys(next.armies)]);
      for (const armyId of armyIds) {
        const previousState = previous.armies[armyId];
        const state = next.armies[armyId];
        const previousPosition = previous.positions?.[armyId];
        const nextPosition = next.positions?.[armyId];
        if (
          JSON.stringify(previousState) === JSON.stringify(state) &&
          JSON.stringify(previousPosition) === JSON.stringify(nextPosition)
        ) {
          continue;
        }
        const item = itemById.get(armyId);
        if (!item) continue;
        if (!canCommit()) throw new Error("Coordinator stopped during persistence");
        await this.port.patchSceneItemMetadata(armyId, METADATA_KEYS.army, state, {
          visible: state === undefined,
          ...(nextPosition ? { position: nextPosition } : {})
        }, previousState?.revision ?? null);
        applied.push({
          itemId: armyId,
          key: METADATA_KEYS.army,
          previousValue: previousState,
          rollbackUpdate: {
            visible: item.visible ?? true,
            ...(previousPosition ? { position: previousPosition } : {})
          },
          expectedRevision: state?.revision ?? null
        });
      }
      const barrierIds = new Set([
        ...Object.keys(previous.barriers),
        ...Object.keys(next.barriers)
      ]);
      for (const barrierId of barrierIds) {
        const previousState = previous.barriers[barrierId];
        const state = next.barriers[barrierId];
        if (JSON.stringify(previousState) === JSON.stringify(state)) continue;
        if (!itemById.has(barrierId)) continue;
        if (!canCommit()) throw new Error("Coordinator stopped during persistence");
        await this.port.patchSceneItemMetadata(
          barrierId,
          METADATA_KEYS.barrier,
          state,
          {},
          previousState?.revision ?? null
        );
        applied.push({
          itemId: barrierId,
          key: METADATA_KEYS.barrier,
          previousValue: previousState,
          rollbackUpdate: {},
          expectedRevision: state?.revision ?? null
        });
      }
      if (!canCommit()) throw new Error("Coordinator stopped during persistence");
      const latestScene = await this.repository.readScene();
      if (!canCommit()) throw new Error("Coordinator stopped during persistence");
      if (latestScene.revision !== previous.scene.revision) {
        throw new Error("Scene revision changed during command persistence");
      }
      if (
        expectedCoordinatorConnectionId !== undefined &&
        latestScene.coordinatorLease?.connectionId !== expectedCoordinatorConnectionId
      ) {
        throw new Error("Coordinator lease changed during command persistence");
      }
      const nextSceneWithoutLease = { ...next.scene };
      delete nextSceneWithoutLease.coordinatorLease;
      const sceneToWrite = latestScene.coordinatorLease
        ? { ...nextSceneWithoutLease, coordinatorLease: latestScene.coordinatorLease }
        : nextSceneWithoutLease;
      await this.repository.writeScene(
        sceneToWrite,
        previous.scene.revision,
        (current) =>
          canCommit() &&
          (expectedCoordinatorConnectionId === undefined ||
            current.coordinatorLease?.connectionId === expectedCoordinatorConnectionId)
      );
    } catch (error) {
      for (const write of applied.reverse()) {
        try {
          await this.port.patchSceneItemMetadata(
            write.itemId,
            write.key,
            write.previousValue,
            write.rollbackUpdate,
            write.expectedRevision
          );
        } catch {
          // A newer item revision wins over this guarded compensation.
        }
      }
      throw error;
    }
  }

  writeCoordinatorHeartbeat(
    heartbeat: NonNullable<SceneState["coordinatorLease"]>
  ): Promise<void> {
    return this.enqueueMutation(async () => {
      const canCommit = this.captureCoordinatorGuard(heartbeat.connectionId);
      if (!canCommit()) return;
      const scene = await this.repository.readScene();
      if (!canCommit()) return;
      try {
        await this.repository.writeScene(
          { ...scene, coordinatorLease: heartbeat },
          scene.revision,
          () => canCommit()
        );
      } catch (error) {
        if (!canCommit()) return;
        throw error;
      }
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async whenIdle(): Promise<void> {
    await this.mutationTail;
  }

  private async reconcileOverlays(
    scene: SceneState,
    armies: readonly ArmyRecord[],
    barriers: readonly BarrierRecord[],
    role: "GM" | "PLAYER",
    memberSideIds: readonly string[],
    leaderSideIds: readonly string[]
  ): Promise<void> {
    const overlayPort = {
      getLocalItems: () => this.port.getLocalItems(),
      addLocalItems: (items: readonly SceneItemRecord[]) => this.port.addLocalItems(items),
      updateLocalItems: (items: readonly SceneItemRecord[]) => this.port.updateLocalItems(items),
      deleteLocalItems: (ids: readonly string[]) => this.port.deleteLocalItems(ids),
      createId: () => crypto.randomUUID()
    };
    const sideColors = new Map(scene.sides.map((side) => [side.id, side.color]));
    await new RouteOverlayService(overlayPort).reconcile(
      armies
        .filter((record) => record.state.route.length > 0)
        .map((record) => ({
          armyId: record.item.id,
          sideId: record.state.sideId,
          status: record.state.status,
          color: sideColors.get(record.state.sideId) ?? "#607d8b",
          start: record.item.position,
          waypoints: record.state.route
        })),
      { isGM: role === "GM", memberSideIds, leaderSideIds }
    );
    await new BarrierOverlayService(overlayPort).reconcile(
      barriers.map((record) => ({
        id: record.item.id,
        points: curvePoints(record.item),
        color: record.state.color,
        visibility: record.state.visibility
      })),
      role === "GM"
    );
  }
}

export interface BackgroundApplication {
  stop(): Promise<void>;
}

export async function startBackgroundApplication(): Promise<BackgroundApplication> {
  const [{ default: OBR }, { createOwlbearAdapter }] = await Promise.all([
    import("@owlbear-rodeo/sdk"),
    import("../owlbear/sdkAdapter")
  ]);
  const port = createOwlbearAdapter();
  const engine = new ProductionEngine(port);
  const connectedParty = async (): Promise<ConnectedParticipant[]> => {
    const [players, id, role, currentConnectionId] = await Promise.all([
      OBR.party.getPlayers(),
      OBR.player.getId(),
      OBR.player.getRole(),
      OBR.player.getConnectionId()
    ]);
    return mergeCurrentParticipant(players, { id, role, connectionId: currentConnectionId });
  };
  const party = async (): Promise<CoordinatorParticipant[]> => {
    const players = await connectedParty();
    return players.map((player) => ({ connectionId: player.connectionId, role: player.role }));
  };
  const routeGateway = new CommandGateway(
    port,
    5_000,
    async () => resolveCoordinatorConnectionId(
      await party(),
      await engine.readCoordinatorLease().catch(() => undefined),
      Date.now()
    )
  );
  routeGateway.start();
  const routeService = new RouteToolService(
    Object.assign(port, {
      getPlayerIdentity: async () => {
        const [id, role, currentConnectionId] = await Promise.all([
          OBR.player.getId(),
          OBR.player.getRole(),
          OBR.player.getConnectionId()
        ]);
        return { id, role, connectionId: currentConnectionId };
      },
      createId: () => crypto.randomUUID(),
      activateTool: (toolId: string) => OBR.tool.activateTool(toolId)
    }),
    routeGateway
  );
  let removeRouteTool: RouteToolRegistration;
  try {
    removeRouteTool = await registerRouteTool(
      OBR.tool,
      routeService,
      {
        distance: (from, to) => port.getGridDistance(from, to),
        snapGridCenter: (position) => port.snapGridCenter(position)
      },
      `${import.meta.env.BASE_URL}icon-1.2.png`
    );
  } catch (error) {
    routeGateway.stop();
    throw error;
  }
  const coordinatorListeners = new Set<(active: boolean) => void>();
  const sceneWork = new SceneWorkTracker();
  let commandReady = false;
  const lease = new CoordinatorLease({
    currentConnectionId: () => OBR.player.getConnectionId(),
    now: () => Date.now(),
    participants: party,
    readHeartbeat: () => engine.readCoordinatorLease(),
    writeHeartbeat: (heartbeat) => engine.writeCoordinatorHeartbeat(heartbeat),
    onTransition: (active, activeConnectionId) => {
      engine.setCoordinator(active, activeConnectionId);
      for (const listener of coordinatorListeners) listener(active);
    }
  });

  const runtimePort: BackgroundRuntimePort = {
    isSceneReady: () => OBR.scene.isReady(),
    onSceneReady: (callback) => OBR.scene.onReadyChange(callback),
    onSceneOpen: async () => {
      lease.start();
      try {
        await removeRouteTool.cancelSession();
      } catch {
        // A stale preview must not disable command delivery or coordinator heartbeats.
      }
      commandReady = true;
    },
    onSceneClose: async () => {
      commandReady = false;
      await lease.stop();
      await sceneWork.drain();
      await engine.whenIdle();
      try {
        await removeRouteTool.cancelSession();
      } catch {
        // Scene teardown continues so subscriptions and overlays can still be cleaned up.
      }
    },
    onCoordinatorChange: (callback) => {
      coordinatorListeners.add(callback);
      return () => coordinatorListeners.delete(callback);
    },
    onSceneItemsChange: (callback) => OBR.scene.items.onChange(callback),
    onLocalItemsChange: (callback) => OBR.scene.local.onChange(callback),
    onSceneMetadataChange: (callback) => OBR.scene.onMetadataChange(callback),
    onGridChange: (callback) => OBR.scene.grid.onChange(callback),
    onPlayerChange: (callback) => OBR.player.onChange(callback),
    onPartyChange: (callback) => OBR.party.onChange(callback),
    onBroadcast: (callback) => OBR.broadcast.onMessage(CommandGateway.COMMAND_CHANNEL, (event) => {
      callback();
      sceneWork.track((async () => {
        const [players, currentConnectionId, persistedLease] = await Promise.all([
          connectedParty(),
          OBR.player.getConnectionId(),
          engine.readCoordinatorLease().catch(() => undefined)
        ]);
        await dispatchBackgroundCommand({
          event,
          participants: players,
          currentConnectionId,
          lease: persistedLease,
          now: Date.now(),
          ready: commandReady,
          active: engine.isCoordinator(),
          sendAck: (acknowledgement) => sendCommandAck(port, acknowledgement),
          process: (sender) => engine.processCommand(event, sender)
        });
      })());
    }),
    deleteLocalOverlays: async () => {
      const items = await port.getLocalItems();
      const ids = localOverlayIds(items);
      if (ids.length > 0) await port.deleteLocalItems(ids);
    },
    pauseMovingArmies: () => engine.pauseMovingArmies(),
    movementTick: () => engine.movementTick(),
    visibilityTick: async () => engine.visibilityTick(await OBR.player.getRole(), await OBR.player.getId())
  };
  const runtime = new BackgroundRuntime(runtimePort);
  runtime.start();
  const counter = setInterval(() => {
    const key = `${METADATA_KEYS.scene}/background-counter`;
    localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1));
  }, 1_000);
  let stopWork: Promise<void> | undefined;
  return {
    stop: () => {
      stopWork ??= (async () => {
        clearInterval(counter);
        await runtime.stop();
        await lease.stop();
        try {
          await removeRouteTool();
        } finally {
          routeGateway.stop();
        }
      })();
      return stopWork;
    }
  };
}
