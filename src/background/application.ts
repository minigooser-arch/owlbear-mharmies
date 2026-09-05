import { joinReinforcements } from "../battles/battleGroupService";
import { findEarliestEnemyCollisions } from "../battles/collisionEngine";
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
import { validatePlannedRoute } from "../movement/movementRules";
import {
  reconcileStrategicMovementProgress,
  unenteredRouteCells
} from "../movement/strategicProgress";
import { findStrategicConflictEdges } from "../movement/movementIntent";
import { applyCellPatchBatch, readCell, type CellPatchOperation } from "../terrain/gridMap";
import { annexingStateForEntry } from "../annexation/annexationRules";
import { MapOverlayService } from "../terrain/mapOverlayService";
import { HealthOverlayService } from "../health/healthOverlayService";
import { NavalShipOverlayService } from "../naval/ships/navalShipOverlayService";
import { ShipRouteOverlayService } from "../naval/ships/shipRouteOverlayService";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import { rotationForFacing } from "../naval/ships/shipRotation";
import { visibleShipIdsForPlayer } from "../naval/detection/navalVisibility";
import { validateNavalBattleRequest } from "../naval/battle/navalBattleRequest";
import { getDueTurnBoundary } from "../turns/turnSchedule";
import { completeTurn } from "../turns/turnService";
import { getDestinationMovementCostUnits } from "../terrain/terrainRegistry";
import { GridDistanceService } from "../grid/gridDistance";
import { StrategicGridAdapter } from "../grid/strategicGrid";
import { RouteOverlayService } from "../routes/routeOverlayService";
import { validateStrategicRouteShape } from "../routes/strategicRoute";
import {
  registerRouteTool,
  type RouteToolRegistration
} from "../owlbear/routeToolIntegration";
import {
  registerShipRouteTool,
  type ShipRouteToolRegistration
} from "../owlbear/shipRouteToolIntegration";
import {
  registerTransportLandingTool,
  type TransportLandingToolRegistration
} from "../owlbear/transportLandingTool";
import {
  RouteToolService,
  snapRouteToGrid
} from "./routeToolService";
import { ShipRouteToolService } from "./shipRouteToolService";
import { TransportLandingToolService } from "./transportLandingToolService";
import { MapBrushToolService } from "./mapBrushToolService";
import { NavalBattleAreaToolService } from "./navalBattleAreaToolService";
import { registerMapBrushTool, type MapBrushToolRegistration } from "../owlbear/mapBrushTool";
import { registerNavalBattleAreaTool, type NavalBattleAreaToolRegistration } from "../owlbear/navalBattleAreaTool";
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
import { buildSceneDetectionGraph, detectedShipIdsForSide } from "../visibility/sceneDetectionGraph";
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
    METADATA_KEYS.shipRouteOverlay,
    METADATA_KEYS.shipRoutePreview,
    METADATA_KEYS.barrierOverlay,
    METADATA_KEYS.mapOverlay,
    METADATA_KEYS.healthOverlay,
    METADATA_KEYS.navalShipOverlay,
    METADATA_KEYS.mapBrushPreview,
    METADATA_KEYS.navalBattleAreaPreview
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

  constructor(
    private readonly port: OwlbearPort,
    private readonly wallClock: () => Date = () => new Date()
  ) {
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
    const [scene, armies, barriers, sceneItems] = await Promise.all([
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers(),
      this.port.getSceneItems()
    ]);
    const sceneItemById = new Map(sceneItems.map((item) => [item.id, item]));
    const reciprocallyEmbarkedArmyIds = new Set(armies.flatMap(({ item, state }) => {
      if (state.embarkedOnShipId == null) return [];
      const ship = scene.ships?.[state.embarkedOnShipId];
      return ship?.embarkedArmyId === item.id ? [item.id] : [];
    }));
    const activeLandArmies = armies.filter(({ item }) => !reciprocallyEmbarkedArmyIds.has(item.id));
    const armyDetectionUnits = activeLandArmies.map(({ item, state }) => ({
      id: item.id,
      sideId: state.sideId,
      position: item.position,
      detectionRangeCells:
        state.overrides.detectionRangeCells ?? scene.settings.defaultDetectionRangeCells,
      ignoresVisionBarriers: state.ignoresVisionBarriers
    }));
    const shipDetectionUnits = Object.entries(scene.ships ?? {}).flatMap(([shipId, state]) => {
      const item = sceneItemById.get(shipId);
      if (!item) return [];
      return [{
        id: shipId,
        sideId: state.sideId,
        position: item.position,
        detectionRangeCells: state.detectionOverride ?? scene.settings.defaultDetectionRangeCells,
        ignoresVisionBarriers: false
      }];
    });
    const graph = await buildDetectionGraph({
      mode: scene.settings.detectionMode,
      units: [...armyDetectionUnits, ...shipDetectionUnits],
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
      armies: activeLandArmies.map(({ item, state }) => ({ id: item.id, sideId: state.sideId })),
      detectionGraph: graph,
      battleGroups: scene.battleGroups
    });
    const visibleShips = visibleShipIdsForPlayer({
      isGM: role === "GM",
      playerSideIds: memberSideIds,
      ships: scene.ships ?? {},
      detectionGraph: graph,
      revealUntilTurn: scene.navalRevealUntilTurn ?? {},
      currentTurn: scene.turn.turnNumber
    });
    const shipSources = sceneItems.filter((item) => (scene.ships ?? {})[item.id] !== undefined);
    const visibleSourceIds = new Set([...visible, ...visibleShips]);
    await this.cloneReconciler.reconcile(
      visibleSourceIds,
      [...armies.map((record) => record.item), ...shipSources]
    );
    await this.reconcileOverlays(
      scene,
      activeLandArmies,
      barriers,
      role,
      memberSideIds,
      leaderSideIds,
      visible,
      sceneItems,
      visibleShips
    );
  }

  movementTick(): Promise<void> {
    return this.enqueueMutation(() => this.movementTickNow());
  }

  turnTick(): Promise<void> {
    return this.enqueueMutation(() => this.turnTickNow());
  }

  private async turnTickNow(): Promise<void> {
    if (!this.coordinator) return;
    const expectedCoordinatorConnectionId = this.activeCoordinatorConnectionId;
    const canCommit = this.captureCoordinatorGuard(expectedCoordinatorConnectionId);
    const now = this.wallClock();
    const [scene, armyRecords, barrierRecords, sceneItems] = await Promise.all([
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers(),
      this.port.getSceneItems()
    ]);
    if (!canCommit()) return;
    const boundary = getDueTurnBoundary(now, scene.turn);
    if (!boundary) return;
    const armies = Object.fromEntries(armyRecords.map((record) => [record.item.id, record.state]));
    let strategicGrid: StrategicGridAdapter;
    try {
      strategicGrid = new StrategicGridAdapter({
        dpi: await this.grid.getDpi(),
        offset: { x: 0, y: 0 }
      });
    } catch {
      return;
    }
    const armyCells = Object.fromEntries(armyRecords.map((record) => [
      record.item.id,
      strategicGrid.sceneToCell(record.item.position)
    ]));
    const completion = completeTurn(scene, armies, {
      source: "SCHEDULE",
      completedAt: now,
      boundaryId: boundary.id,
      armyCells
    });
    if (!completion.changed) return;

    const previous: CommandState = {
      scene,
      armies,
      barriers: Object.fromEntries(barrierRecords.map((record) => [record.item.id, record.state])),
      items: Object.fromEntries(sceneItems.map((item) => [item.id, item])),
      positions: Object.fromEntries(sceneItems.map((item) => [item.id, item.position]))
    };
    const next: CommandState = {
      ...structuredClone(previous),
      scene: { ...completion.scene, revision: scene.revision + 1 },
      armies: completion.armies
    };
    if (!canCommit()) return;
    await this.persistCommandState(next, previous, sceneItems);
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
    const moving = armies.filter((record) => {
      if (record.state.status !== "MOVING") return false;
      const shipId = record.state.embarkedOnShipId;
      if (shipId == null) return true;
      return scene.ships?.[shipId]?.embarkedArmyId !== record.item.id;
    });
    if (moving.length === 0) return;
    const movementBarriers = extractBarrierSegments(barriers, "movement");
    let strategicGrid: StrategicGridAdapter;
    try {
      strategicGrid = new StrategicGridAdapter({
        dpi: await this.grid.getDpi(),
        offset: { x: 0, y: 0 }
      });
    } catch {
      return;
    }
    const frames: Array<{
      record: ArmyRecord;
      from: Vector2;
      to: Vector2;
      state: ArmyState;
    }> = [];
    const movingIds = new Set(moving.map((record) => record.item.id));
    const strategicConflictEdges = findStrategicConflictEdges(
      moving.flatMap((record) => {
        const enteredCount = Math.max(0, Math.min(record.state.plannedRoute.cells.length, record.state.movement.enteredRouteCellCount));
        const nextCell = record.state.plannedRoute.cells[enteredCount];
        if (!nextCell) return [];
        return [{
          armyId: record.item.id,
          sideId: record.state.sideId,
          from: strategicGrid.sceneToCell(record.item.position),
          to: nextCell
        }];
      }),
      (left, right) => relation(scene, left, right),
      armies
        .filter((record) => !movingIds.has(record.item.id))
        .map((record) => ({
          armyId: record.item.id,
          sideId: record.state.sideId,
          cell: strategicGrid.sceneToCell(record.item.position)
        }))
    );
    const strategicBattleArmyIds = new Set(strategicConflictEdges.flat());
    for (const record of moving) {
      if (strategicBattleArmyIds.has(record.item.id)) {
        frames.push({
          record,
          from: { ...record.item.position },
          to: { ...record.item.position },
          state: cloneArmyState(record.state, {
            status: "IN_BATTLE",
            stopReason: "BATTLE",
            movement: { ...record.state.movement, remainingUnits: 0 }
          })
        });
        continue;
      }
      const enteredCount = Math.max(
        0,
        Math.min(record.state.plannedRoute.cells.length, record.state.movement.enteredRouteCellCount)
      );
      const remainingCells = unenteredRouteCells(record.state.plannedRoute.cells, enteredCount);
      const remainingStart = enteredCount === 0
        ? record.state.plannedRoute.startCell
        : record.state.plannedRoute.cells[enteredCount - 1] ?? record.state.plannedRoute.startCell;
      const validation = record.state.plannedRoute.requiresReplan
        ? undefined
        : validatePlannedRoute({
            start: remainingStart,
            cells: remainingCells,
            sideId: record.state.sideId,
            terrain: scene.terrain,
            wars: scene.wars,
            remainingUnits: record.state.movement.remainingUnits,
            readCell: (cell) => readCell(scene.gridMap, cell),
            armyStateAllowsMovement: true
          });
      if (!validation || !validation.valid) {
        const plannedRoute: ArmyState["plannedRoute"] = validation && !validation.valid
          ? {
              ...record.state.plannedRoute,
              validatedRevision: scene.revision,
              invalidReason: validation.reason,
              invalidCell: { ...validation.problemCell }
            }
          : { ...record.state.plannedRoute };
        frames.push({
          record,
          from: { ...record.item.position },
          to: { ...record.item.position },
          state: cloneArmyState(record.state, {
            status: "PAUSED",
            stopReason: "INVALID_ROUTE",
            plannedRoute
          })
        });
        continue;
      }

      const plannedRoute: ArmyState["plannedRoute"] = {
        startCell: { ...record.state.plannedRoute.startCell },
        executeOnTurn: record.state.plannedRoute.executeOnTurn,
        cells: record.state.plannedRoute.cells.map((cell) => ({ ...cell })),
        totalCostUnits: record.state.plannedRoute.totalCostUnits,
        validatedRevision: scene.revision,
        requiresReplan: false
      };
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
          plannedRoute,
          ...(result.stopReason ? { stopReason: result.stopReason } : {})
        })
      });
    }

    const collisions = await findEarliestEnemyCollisions({
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
    const collisionEdges = collisions.map((collision) => [collision.armyAId, collision.armyBId] as const);
    const allBattleEdges = [...strategicConflictEdges, ...collisionEdges];
    if (allBattleEdges.length > 0) {
      battleGroups = joinReinforcements(scene.battleGroups, allBattleEdges, () => crypto.randomUUID());
      const collisionPositions = new Map<string, Vector2>();
      for (const collision of collisions) {
        collisionPositions.set(collision.armyAId, collision.positionA);
        collisionPositions.set(collision.armyBId, collision.positionB);
      }
      for (const frame of frames) {
        const inBattle = allBattleEdges.some(([left, right]) => left === frame.record.item.id || right === frame.record.item.id);
        if (!inBattle) continue;
        const collisionPosition = collisionPositions.get(frame.record.item.id);
        if (collisionPosition) frame.to = collisionPosition;
        const group = battleGroups.find((candidate) => candidate.participantIds.includes(frame.record.item.id));
        frame.state = cloneArmyState(frame.state, {
          status: "IN_BATTLE",
          stopReason: "BATTLE",
          movement: { ...frame.state.movement, remainingUnits: 0 },
          ...(group ? { battleGroupId: group.battleId } : {})
        });
      }
      for (const record of armies) {
        if (movingIds.has(record.item.id) || !strategicBattleArmyIds.has(record.item.id)) continue;
        const group = battleGroups.find((candidate) => candidate.participantIds.includes(record.item.id));
        if (!canCommit()) return;
        await this.port.patchSceneItemMetadata(
          record.item.id,
          METADATA_KEYS.army,
          cloneArmyState(record.state, {
            status: "IN_BATTLE",
            stopReason: "BATTLE",
            movement: { ...record.state.movement, remainingUnits: 0 },
            ...(group ? { battleGroupId: group.battleId } : {})
          }),
          {},
          record.state.revision
        );
      }
    }

    const annexOperations: CellPatchOperation[] = [];
    for (const frame of frames) {
      if (!frame.state.plannedRoute.requiresReplan && frame.state.plannedRoute.cells.length > 0) {
        const progress = reconcileStrategicMovementProgress({
          routeCells: frame.state.plannedRoute.cells,
          previousEnteredCount: frame.record.state.movement.enteredRouteCellCount,
          movementWaypointIndex: frame.state.currentWaypointIndex,
          finalCell: strategicGrid.sceneToCell(frame.to),
          remainingUnits: frame.record.state.movement.remainingUnits,
          costForCell: (cell) => {
            const cost = getDestinationMovementCostUnits(scene.terrain, readCell(scene.gridMap, cell));
            if (cost === undefined) throw new Error(`Invalid terrain for strategic cell ${cell.x},${cell.y}`);
            return cost;
          }
        });
        frame.state = {
          ...frame.state,
          movement: {
            ...frame.state.movement,
            remainingUnits: frame.state.status === "IN_BATTLE" ? 0 : progress.remainingUnits,
            enteredRouteCellCount: progress.enteredRouteCellCount
          }
        };
        const enteredCells = frame.state.plannedRoute.cells.slice(
          frame.record.state.movement.enteredRouteCellCount,
          progress.enteredRouteCellCount
        );
        for (const cell of enteredCells) {
          const destination = readCell(scene.gridMap, cell);
          const annexingStateId = annexingStateForEntry(
            { states: scene.states, sides: scene.sides, wars: scene.wars },
            frame.state.sideId,
            destination
          );
          if (annexingStateId) annexOperations.push({ cell, patch: { deFactoStateId: annexingStateId } });
        }
      }
      if (!canCommit()) return;
      await this.port.patchSceneItemMetadata(
        frame.record.item.id,
        METADATA_KEYS.army,
        frame.state,
        { position: frame.to },
        frame.record.state.revision
      );
    }
    const nextGridMap = applyCellPatchBatch(scene.gridMap, annexOperations);
    if (battleGroups || nextGridMap !== scene.gridMap) {
      if (!canCommit()) return;
      await this.repository.writeScene(
        {
          ...scene,
          revision: scene.revision + 1,
          battleGroups: battleGroups ?? scene.battleGroups,
          gridMap: nextGridMap
        },
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
    let commandCellForPosition: ((position: Vector2) => import("../shared/types").GridCellCoord) | undefined;
    let commandPositionForCell: ((cell: import("../shared/types").GridCellCoord) => Vector2) | undefined;
    if (
      command.type === "COMPLETE_TURN_NOW" ||
      command.type === "REGISTER_SHIP" ||
      command.type === "SET_SHIP_ROUTE" ||
      command.type === "NAVAL_MOVE_FORWARD" ||
      command.type === "START_NAVAL_BATTLE" ||
      command.type === "EMBARK_ARMY" ||
      command.type === "ACCEPT_EMBARK_ARMY" ||
      command.type === "DISEMBARK_ARMY"
    ) {
      try {
        const grid = new StrategicGridAdapter({ dpi: await this.grid.getDpi(), offset: { x: 0, y: 0 } });
        commandCellForPosition = (position) => grid.sceneToCell(position);
        commandPositionForCell = (cell) => grid.cellToSceneCenter(cell);
      } catch {
        // CommandProcessor rejects commands that require strategic cells when positions cannot be resolved.
      }
    }
    let detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set<string>();
    if (
      command.type === "REQUEST_NAVAL_BATTLE" ||
      (command.type === "START_NAVAL_BATTLE" && command.navalRequestId !== null)
    ) {
      try {
        const detectionGraph = await buildSceneDetectionGraph({
          scene,
          armies: armyRecords,
          sceneItems,
          distancePort: this.grid,
          visionBarriers: extractBarrierSegments(barrierRecords, "vision")
        });
        detectedNavalTargetsForSide = (sideId) =>
          detectedShipIdsForSide(detectionGraph, scene.ships ?? {}, sideId);
      } catch {
        // Detection-dependent commands fail closed while authoritative geometry is unavailable.
      }
    }
    if (command.type === "START_NAVAL_BATTLE" && command.navalRequestId !== null) {
      const navalRequest = scene.navalBattleRequests?.find(
        (candidate) => candidate.id === command.navalRequestId
      );
      if (!navalRequest) {
        await sendCommandAck(this.port, {
          requestId: command.requestId,
          status: "REJECTED",
          reason: "NAVAL_BATTLE_REQUEST_NOT_FOUND",
          coordinatorConnectionId: await this.currentConnectionId(),
          recipientConnectionId: sender.connectionId
        });
        return;
      }
      if (
        navalRequest.initiatingShipId !== command.initiatingShipId ||
        !command.participantShipIds.includes(navalRequest.targetShipId)
      ) {
        await sendCommandAck(this.port, {
          requestId: command.requestId,
          status: "REJECTED",
          reason: "INVALID_NAVAL_BATTLE_REQUEST",
          coordinatorConnectionId: await this.currentConnectionId(),
          recipientConnectionId: sender.connectionId
        });
        return;
      }
      const initiatingShip = scene.ships?.[navalRequest.initiatingShipId];
      const requestValidation = validateNavalBattleRequest({
        scene: scene as import("../shared/types").NavalSceneState,
        request: navalRequest,
        detectedTargetShipIds: initiatingShip
          ? detectedNavalTargetsForSide(initiatingShip.sideId)
          : new Set<string>()
      });
      if (!requestValidation.ok) {
        await sendCommandAck(this.port, {
          requestId: command.requestId,
          status: "REJECTED",
          reason: requestValidation.reason,
          coordinatorConnectionId: await this.currentConnectionId(),
          recipientConnectionId: sender.connectionId
        });
        return;
      }
    }
    const result = new CommandProcessor(
      () => this.wallClock(),
      commandCellForPosition,
      commandPositionForCell,
      detectedNavalTargetsForSide
    ).execute(
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
        let failure: ReturnType<typeof validateStrategicRouteShape>;
        try {
          const gridDpi = await this.grid.getDpi();
          failure = validateStrategicRouteShape({
            start: snapped.start,
            route: snapped.route,
            startCell: command.startCell,
            cells: command.cells,
            grid: new StrategicGridAdapter({ dpi: gridDpi, offset: { x: 0, y: 0 } }),
            barriers: army.state.ignoresMovementBarriers
              ? []
              : extractBarrierSegments(barrierRecords, "movement")
          });
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
      const previousShips = previous.scene.ships ?? {};
      const nextShips = next.scene.ships ?? {};
      const shipIds = new Set([...Object.keys(previousShips), ...Object.keys(nextShips)]);
      for (const shipId of shipIds) {
        const previousState = previousShips[shipId];
        const state = nextShips[shipId];
        const previousPosition = previous.positions?.[shipId];
        const nextPosition = next.positions?.[shipId];
        if (
          JSON.stringify(previousState) === JSON.stringify(state) &&
          JSON.stringify(previousPosition) === JSON.stringify(nextPosition)
        ) continue;
        const item = itemById.get(shipId);
        if (!item) continue;
        if (!canCommit()) throw new Error("Coordinator stopped during persistence");
        await this.port.patchSceneItemMetadata(
          shipId,
          METADATA_KEYS.ship,
          state,
          {
            visible: state === undefined,
            ...(nextPosition ? { position: nextPosition } : {}),
            ...(state ? { rotation: rotationForFacing(state.facing) } : {})
          },
          previousState?.revision ?? null
        );
        applied.push({
          itemId: shipId,
          key: METADATA_KEYS.ship,
          previousValue: previousState,
          rollbackUpdate: {
            visible: item.visible ?? true,
            ...(previousPosition ? { position: previousPosition } : {}),
            ...(item.rotation !== undefined ? { rotation: item.rotation } : {})
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
    leaderSideIds: readonly string[],
    visibleArmyIds: ReadonlySet<string>,
    sceneItems: readonly SceneItemRecord[],
    visibleShipIds: ReadonlySet<string>
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
    const plannedShips = Object.entries(scene.ships ?? {}).filter(([, state]) => state.plannedRoute.length > 0);
    const shipRouteViewer = { isGM: role === "GM", leaderSideIds };
    if (plannedShips.length === 0) {
      await new ShipRouteOverlayService(overlayPort).reconcile([], shipRouteViewer);
    } else {
      try {
        const routeGrid = new StrategicGridAdapter({ dpi: await this.grid.getDpi(), offset: { x: 0, y: 0 } });
        const routeItemById = new Map(sceneItems.map((item) => [item.id, item]));
        await new ShipRouteOverlayService(overlayPort).reconcile(
          plannedShips.flatMap(([shipId, state]) => {
            const item = routeItemById.get(shipId);
            if (!item) return [];
            return [{
              shipId,
              sideId: state.sideId,
              color: sideColors.get(state.sideId) ?? "#607d8b",
              start: item.position,
              waypoints: state.plannedRoute.map((cell) => routeGrid.cellToSceneCenter(cell))
            }];
          }),
          shipRouteViewer
        );
      } catch {
        // Preserve the last valid route overlay while Owlbear grid geometry is unavailable.
      }
    }

    await new BarrierOverlayService(overlayPort).reconcile(
      barriers.map((record) => ({
        id: record.item.id,
        points: curvePoints(record.item),
        color: record.state.color,
        visibility: record.state.visibility
      })),
      role === "GM"
    );

    await new HealthOverlayService(overlayPort).reconcile(
      armies.map((record) => ({
        armyId: record.item.id,
        position: record.item.position,
        hp: record.state.health.hp,
        maxHp: record.state.health.maxHp,
        color: sideColors.get(record.state.sideId) ?? "#ffffff"
      })),
      visibleArmyIds
    );

    const sceneItemById = new Map(sceneItems.map((item) => [item.id, item]));
    await new NavalShipOverlayService(overlayPort).reconcile(
      Object.entries(scene.ships ?? {}).flatMap(([shipId, state]) => {
        const item = sceneItemById.get(shipId);
        if (!item) return [];
        const definition = SHIP_CLASSES[state.classId];
        return [{
          shipId,
          name: item.name?.trim() || definition.name,
          position: item.position,
          hp: state.hp,
          maxHp: definition.maxHp,
          color: sideColors.get(state.sideId) ?? "#ffffff"
        }];
      }),
      visibleShipIds
    );

    const mapOverlayService = new MapOverlayService(overlayPort);
    if (role !== "GM") {
      await mapOverlayService.reconcile(undefined);
      return;
    }
    try {
      await mapOverlayService.reconcile({
        dpi: await this.grid.getDpi(),
        gridMap: scene.gridMap,
        terrain: scene.terrain,
        sides: scene.sides,
        states: scene.states
      });
    } catch {
      // Keep the last valid GM map overlay if grid geometry is temporarily unavailable.
    }
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
  const toolPort = Object.assign(port, {
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
  });
  const routeService = new RouteToolService(toolPort, routeGateway);
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
  const shipRouteService = new ShipRouteToolService(toolPort, routeGateway);
  let removeShipRouteTool: ShipRouteToolRegistration;
  try {
    removeShipRouteTool = await registerShipRouteTool(
      OBR.tool,
      shipRouteService,
      { snapGridCenter: (position) => port.snapGridCenter(position) },
      `${import.meta.env.BASE_URL}icon-1.2.png`
    );
  } catch (error) {
    await removeRouteTool();
    routeGateway.stop();
    throw error;
  }
  const transportLandingService = new TransportLandingToolService(toolPort, routeGateway);
  let removeTransportLandingTool: TransportLandingToolRegistration;
  try {
    removeTransportLandingTool = await registerTransportLandingTool(
      OBR.tool,
      transportLandingService,
      `${import.meta.env.BASE_URL}icon-1.2.png`
    );
  } catch (error) {
    await removeShipRouteTool();
    await removeRouteTool();
    routeGateway.stop();
    throw error;
  }
  let removeMapBrushTool: MapBrushToolRegistration;
  try {
    removeMapBrushTool = await registerMapBrushTool(
      OBR.tool,
      new MapBrushToolService(toolPort, routeGateway),
      `${import.meta.env.BASE_URL}icon-1.2.png`
    );
  } catch (error) {
    await removeTransportLandingTool();
    await removeShipRouteTool();
    await removeRouteTool();
    routeGateway.stop();
    throw error;
  }
  let removeNavalBattleAreaTool: NavalBattleAreaToolRegistration;
  try {
    removeNavalBattleAreaTool = await registerNavalBattleAreaTool(
      OBR.tool,
      new NavalBattleAreaToolService(toolPort),
      `${import.meta.env.BASE_URL}icon-1.2.png`
    );
  } catch (error) {
    await removeMapBrushTool();
    await removeTransportLandingTool();
    await removeShipRouteTool();
    await removeRouteTool();
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
        await Promise.all([
          removeRouteTool.cancelSession(),
          removeShipRouteTool.cancelSession(),
          removeTransportLandingTool.cancelSession(),
          removeTransportLandingTool.cancelSession()
        ]);
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
        await Promise.all([
          removeRouteTool.cancelSession(),
          removeShipRouteTool.cancelSession()
        ]);
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
    visibilityTick: async () => engine.visibilityTick(await OBR.player.getRole(), await OBR.player.getId()),
    turnTick: () => engine.turnTick()
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
          await removeNavalBattleAreaTool();
          await removeMapBrushTool();
          await removeTransportLandingTool();
          await removeShipRouteTool();
          await removeRouteTool();
        } finally {
          routeGateway.stop();
        }
      })();
      return stopWork;
    }
  };
}
