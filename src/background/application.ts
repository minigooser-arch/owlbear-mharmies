import { applyCollision } from "../battles/battleGroupService";
import { findEarliestEnemyCollision } from "../battles/collisionEngine";
import { segmentsFromPolyline, type BarrierSegment } from "../barriers/barrierGeometry";
import { BarrierOverlayService } from "../barriers/barrierOverlayService";
import { CommandGateway, type BroadcastEvent } from "../commands/commandGateway";
import { CommandProcessor, type CommandState } from "../commands/commandProcessor";
import { validateArmyCommand } from "../commands/commandValidation";
import { advanceArmy } from "../movement/movementEngine";
import { GridDistanceService } from "../grid/gridDistance";
import { RouteOverlayService } from "../routes/routeOverlayService";
import { METADATA_KEYS } from "../shared/constants";
import type {
  ArmyState,
  BattleGroup,
  SceneItemRecord,
  SceneState,
  SideRelation,
  Vector2
} from "../shared/types";
import { MetadataRepository, type ArmyRecord, type BarrierRecord } from "../storage/metadataRepository";
import { buildDetectionGraph } from "../visibility/detectionGraph";
import { LocalCloneReconciler, UpdateOriginGuard } from "../visibility/localCloneReconciler";
import { visibleArmyIdsForPlayer } from "../visibility/visibilityEngine";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { CoordinatorLease, type CoordinatorParticipant } from "./coordinator";
import { BackgroundRuntime, type BackgroundRuntimePort } from "./runtime";

type BarrierPurpose = "movement" | "vision";

export interface ConnectedParticipant {
  id: string;
  connectionId: string;
  role: "GM" | "PLAYER";
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

export class ProductionEngine {
  private readonly repository: MetadataRepository;
  private readonly grid: GridDistanceService;
  private readonly cloneReconciler: LocalCloneReconciler;
  private coordinator = false;
  private lastMovementAt = performance.now();
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly port: OwlbearPort) {
    this.repository = new MetadataRepository(port);
    this.grid = new GridDistanceService(port);
    this.cloneReconciler = new LocalCloneReconciler(port, new UpdateOriginGuard());
  }

  setCoordinator(active: boolean): void {
    this.coordinator = active;
    if (active) this.lastMovementAt = performance.now();
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
    const playerSideIds = scene.sides
      .filter((side) => side.playerIds.includes(playerId))
      .map((side) => side.id);
    const visible = visibleArmyIdsForPlayer({
      isGM: role === "GM",
      playerSideIds,
      armies: armies.map(({ item, state }) => ({ id: item.id, sideId: state.sideId })),
      detectionGraph: graph,
      battleGroups: scene.battleGroups
    });
    await this.cloneReconciler.reconcile(visible, armies.map((record) => record.item));
    await this.reconcileOverlays(scene, armies, barriers, role, playerSideIds);
  }

  movementTick(): Promise<void> {
    return this.enqueueMutation(() => this.movementTickNow());
  }

  private async movementTickNow(): Promise<void> {
    if (!this.coordinator) return;
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
      await this.port.updateSceneItem(frame.record.item.id, {
        position: frame.to,
        metadata: {
          ...frame.record.item.metadata,
          [METADATA_KEYS.army]: frame.state
        }
      });
    }
    if (battleGroups) {
      await this.port.patchSceneMetadata({
        [METADATA_KEYS.scene]: { ...scene, revision: scene.revision + 1, battleGroups }
      });
    }
  }

  pauseMovingArmies(): Promise<void> {
    return this.enqueueMutation(() => this.pauseMovingArmiesNow());
  }

  private async pauseMovingArmiesNow(): Promise<void> {
    const armies = await this.repository.readArmies();
    for (const record of armies) {
      if (record.state.status !== "MOVING") continue;
      await this.port.updateSceneItem(record.item.id, {
        metadata: {
          ...record.item.metadata,
          [METADATA_KEYS.army]: cloneArmyState(record.state, {
            status: "PAUSED",
            stopReason: "COORDINATOR_GAP"
          })
        }
      });
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
        await this.port.send(CommandGateway.ACK_CHANNEL, {
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
      positions: Object.fromEntries(armyRecords.map((record) => [record.item.id, record.item.position]))
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
    if (result.status === "ACCEPTED") {
      try {
        await this.persistCommandState(result.state, commandState, sceneItems);
      } catch {
        try {
          await this.persistCommandState(commandState, result.state, sceneItems);
        } catch {
          // Best-effort rollback: Owlbear scene/item writes are not transactional.
        }
        await this.port.send(CommandGateway.ACK_CHANNEL, {
          requestId: command.requestId,
          status: "REJECTED",
          reason: "PERSISTENCE_FAILED",
          coordinatorConnectionId,
          recipientConnectionId: sender.connectionId
        });
        return;
      }
      await this.port.send(CommandGateway.ACK_CHANNEL, {
        requestId: command.requestId,
        status: "ACCEPTED",
        coordinatorConnectionId,
        recipientConnectionId: sender.connectionId
      });
    } else {
      await this.port.send(CommandGateway.ACK_CHANNEL, {
        requestId: command.requestId,
        status: result.status,
        coordinatorConnectionId,
        recipientConnectionId: sender.connectionId,
        ...(result.status === "REJECTED" ? { reason: result.reason } : { actualRevision: result.actualRevision })
      });
    }
  }

  private async currentConnectionId(): Promise<string> {
    const raw = (await this.repository.readScene()).coordinatorLease?.connectionId;
    return raw ?? "";
  }

  private async persistCommandState(
    next: CommandState,
    previous: CommandState,
    items: readonly SceneItemRecord[]
  ): Promise<void> {
    await this.port.patchSceneMetadata({ [METADATA_KEYS.scene]: next.scene });
    const itemById = new Map(items.map((item) => [item.id, item]));
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
      const metadata = Object.fromEntries(
        Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.army)
      );
      if (state) metadata[METADATA_KEYS.army] = state;
      await this.port.updateSceneItem(armyId, {
        metadata,
        visible: state === undefined,
        ...(next.positions?.[armyId] ? { position: next.positions[armyId] } : {})
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
      const item = itemById.get(barrierId);
      if (!item) continue;
      const metadata = Object.fromEntries(
        Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.barrier)
      );
      if (state) metadata[METADATA_KEYS.barrier] = state;
      await this.port.updateSceneItem(barrierId, { metadata });
    }
  }

  writeCoordinatorHeartbeat(
    heartbeat: NonNullable<SceneState["coordinatorLease"]>
  ): Promise<void> {
    return this.enqueueMutation(async () => {
      const scene = await this.repository.readScene();
      await this.port.patchSceneMetadata({
        [METADATA_KEYS.scene]: { ...scene, coordinatorLease: heartbeat }
      });
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

  private async reconcileOverlays(
    scene: SceneState,
    armies: readonly ArmyRecord[],
    barriers: readonly BarrierRecord[],
    role: "GM" | "PLAYER",
    playerSideIds: readonly string[]
  ): Promise<void> {
    const overlayPort = {
      getItems: () => this.port.getLocalItems(),
      addItems: async (items: SceneItemRecord[]) => {
        for (const item of items) await this.port.addLocalItem(item);
      },
      deleteItems: (ids: readonly string[]) => this.port.deleteLocalItems(ids),
      createId: () => crypto.randomUUID()
    };
    const sideColors = new Map(scene.sides.map((side) => [side.id, side.color]));
    await new RouteOverlayService(overlayPort).reconcile(
      armies
        .filter((record) => record.state.route.length > 0)
        .map((record) => ({
          armyId: record.item.id,
          sideId: record.state.sideId,
          color: sideColors.get(record.state.sideId) ?? "#607d8b",
          start: record.item.position,
          waypoints: record.state.route
        })),
      { isGM: role === "GM", playerSideIds }
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
  stop(): void;
}

export async function startBackgroundApplication(): Promise<BackgroundApplication> {
  const [{ default: OBR }, { createOwlbearAdapter }] = await Promise.all([
    import("@owlbear-rodeo/sdk"),
    import("../owlbear/sdkAdapter")
  ]);
  const port = createOwlbearAdapter();
  const engine = new ProductionEngine(port);
  const connectionId = await OBR.player.getConnectionId();
  const coordinatorListeners = new Set<(active: boolean) => void>();
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
  const lease = new CoordinatorLease({
    connectionId,
    now: () => Date.now(),
    participants: party,
    writeHeartbeat: (heartbeat) => engine.writeCoordinatorHeartbeat(heartbeat),
    onTransition: (active) => {
      engine.setCoordinator(active);
      for (const listener of coordinatorListeners) listener(active);
    }
  });

  const runtimePort: BackgroundRuntimePort = {
    onSceneReady: (callback) => OBR.scene.onReadyChange(callback),
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
      void (async () => {
        const players = await connectedParty();
        const sender = players.find((player) => player.connectionId === event.connectionId);
        if (!sender) return;
        await engine.processCommand(event, {
          role: sender.role,
          playerId: sender.id,
          connectionId: sender.connectionId,
          connectedPlayerIds: new Set(players.map((player) => player.id))
        });
      })();
    }),
    deleteLocalOverlays: async () => {
      const items = await port.getLocalItems();
      const keys = [METADATA_KEYS.localClone, METADATA_KEYS.routeOverlay, METADATA_KEYS.barrierOverlay];
      const ids = items.filter((item) => keys.some((key) => item.metadata[key] !== undefined)).map((item) => item.id);
      if (ids.length > 0) await port.deleteLocalItems(ids);
    },
    pauseMovingArmies: () => engine.pauseMovingArmies(),
    movementTick: () => engine.movementTick(),
    visibilityTick: async () => engine.visibilityTick(await OBR.player.getRole(), await OBR.player.getId())
  };
  const runtime = new BackgroundRuntime(runtimePort);
  runtime.start();
  lease.start();
  const counter = setInterval(() => {
    const key = `${METADATA_KEYS.scene}/background-counter`;
    localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1));
  }, 1_000);
  return {
    stop: () => {
      clearInterval(counter);
      runtime.stop();
      lease.stop();
    }
  };
}
