import { applyCollision } from "../../battles/battleGroupService";
import { findEarliestEnemyCollision } from "../../battles/collisionEngine";
import type { BarrierSegment } from "../../barriers/barrierGeometry";
import { advanceArmy } from "../../movement/movementEngine";
import { evaluateRouteLimit, type GridDistancePort } from "../../routes/routeMath";
import { METADATA_KEYS } from "../../shared/constants";
import type {
  BattleGroup,
  DetectionMode,
  ItemUpdate,
  SceneItemRecord,
  SideRelation
} from "../../shared/types";
import { buildDetectionGraph } from "../../visibility/detectionGraph";
import {
  LocalCloneReconciler,
  UpdateOriginGuard,
  type LocalClonePort
} from "../../visibility/localCloneReconciler";
import { visibleArmyIdsForPlayer } from "../../visibility/visibilityEngine";
import { roomArmy, roomArmyImage, type RoomArmy } from "./factories";

const distancePort: GridDistancePort = {
  distance: async (from, to) => Math.hypot(to.x - from.x, to.y - from.y)
};

class ClientLocalPort implements LocalClonePort {
  items: SceneItemRecord[] = [];
  private nextId = 0;

  async getLocalItems() { return structuredClone(this.items); }
  async addLocalItem(item: SceneItemRecord) { this.items.push(structuredClone(item)); }
  async updateLocalItem(id: string, update: ItemUpdate) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, structuredClone(update));
  }
  async deleteLocalItems(ids: readonly string[]) {
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
  createClone(source: SceneItemRecord): SceneItemRecord {
    this.nextId += 1;
    return {
      ...structuredClone(source),
      id: `local-${this.nextId}`,
      visible: true,
      metadata: { [METADATA_KEYS.localClone]: { sourceItemId: source.id } }
    };
  }
}

export class FourClientRoom {
  private readonly armies = new Map<string, RoomArmy>();
  private readonly relations: Record<string, Record<string, SideRelation>> = {};
  private readonly clients = new Map<string, ClientLocalPort>();
  private visionBarriers: BarrierSegment[] = [];
  private movementBarriers: BarrierSegment[] = [];
  private battleGroups: BattleGroup[] = [];
  private detectionMode: DetectionMode = "INDEPENDENT";
  private registered = false;

  async registerArmies(): Promise<void> {
    this.armies.clear();
    this.armies.set("a-army", roomArmy("a-army", "A", "Армия A", 0));
    this.armies.set("b-army", roomArmy("b-army", "B", "Армия B", 5));
    this.armies.set("c-army", roomArmy("c-army", "C", "Армия C", 100));
    this.clients.set("A", new ClientLocalPort());
    this.clients.set("B", new ClientLocalPort());
    this.clients.set("C", new ClientLocalPort());
    this.registered = true;
  }

  setEnemy(left: string, right: string): void {
    this.setRelation(left, right, "ENEMY");
  }

  setDetectionMode(mode: DetectionMode): void {
    this.detectionMode = mode;
  }

  async setRoutesTowardEachOther(limit: number): Promise<void> {
    this.requireRegistered();
    const a = this.armies.get("a-army");
    const b = this.armies.get("b-army");
    if (!a || !b) throw new Error("Room armies missing");
    const routeA = [{ ...b.position }];
    const routeB = [{ ...a.position }];
    const validA = await evaluateRouteLimit(a.position, routeA, limit, distancePort);
    const validB = await evaluateRouteLimit(b.position, routeB, limit, distancePort);
    if (!validA.valid || !validB.valid) throw new Error("Route limit exceeded");
    a.state.route = routeA;
    b.state.route = routeB;
    a.state.currentWaypointIndex = 0;
    b.state.currentWaypointIndex = 0;
  }

  globalStart(): void {
    for (const army of this.armies.values()) {
      if (army.state.route.length > 0 && army.state.status !== "IN_BATTLE") army.state.status = "MOVING";
    }
  }

  async visibleTo(sideId: string): Promise<Set<string>> {
    const graph = await buildDetectionGraph({
      mode: this.detectionMode,
      units: [...this.armies.values()].map((army) => ({
        id: army.id,
        sideId: army.sideId,
        position: army.position,
        detectionRangeCells: army.detectionRangeCells,
        ignoresVisionBarriers: army.state.ignoresVisionBarriers
      })),
      distancePort,
      visionBarriers: this.visionBarriers
    });
    return visibleArmyIdsForPlayer({
      isGM: false,
      playerSideIds: [sideId],
      armies: [...this.armies.values()].map((army) => ({ id: army.id, sideId: army.sideId })),
      detectionGraph: graph,
      battleGroups: this.battleGroups
    });
  }

  async advanceUntilContact(): Promise<void> {
    for (let step = 0; step < 20; step += 1) {
      await this.advance(0.25);
      if ([...this.armies.values()].some((army) => army.state.status === "IN_BATTLE")) return;
    }
    throw new Error("Armies did not collide");
  }

  async advance(deltaSeconds: number): Promise<void> {
    const moving = [...this.armies.values()].filter((army) => army.state.status === "MOVING");
    const previous = new Map(moving.map((army) => [army.id, { ...army.position }]));
    for (const army of moving) {
      const result = await advanceArmy({
        position: army.position,
        waypoints: army.state.route,
        currentWaypointIndex: army.state.currentWaypointIndex,
        segmentProgressCells: army.state.segmentProgressCells,
        speedCellsPerSecond: army.speedCellsPerSecond,
        deltaSeconds,
        distancePort,
        movementBarriers: this.movementBarriers,
        ignoresMovementBarriers: army.state.ignoresMovementBarriers
      });
      army.position = result.position;
      army.state.currentWaypointIndex = result.currentWaypointIndex;
      army.state.segmentProgressCells = result.segmentProgressCells;
      army.state.status = result.status;
    }
    const collision = await findEarliestEnemyCollision({
      armies: moving.map((army) => ({
        id: army.id,
        sideId: army.sideId,
        from: previous.get(army.id) ?? army.position,
        to: army.position,
        collisionRangeCells: army.collisionRangeCells
      })),
      relationForSides: (left, right) => this.relations[left]?.[right] ?? "NEUTRAL",
      distancePort
    });
    if (!collision) return;
    const left = this.armies.get(collision.armyAId);
    const right = this.armies.get(collision.armyBId);
    if (!left || !right) return;
    left.position = collision.positionA;
    right.position = collision.positionB;
    left.state.status = "IN_BATTLE";
    right.state.status = "IN_BATTLE";
    this.battleGroups = applyCollision(this.battleGroups, collision, () => "battle-001");
    const group = this.battleGroups.find((candidate) =>
      candidate.participantIds.includes(left.id)
    );
    if (group) {
      left.state.battleGroupId = group.battleId;
      right.state.battleGroupId = group.battleId;
    }
  }

  addVisionWall(x: number): void {
    this.visionBarriers = [{ barrierId: "vision-wall", from: { x, y: -10 }, to: { x, y: 10 } }];
  }

  addMovementWall(x: number): void {
    this.movementBarriers = [{ barrierId: "movement-wall", from: { x, y: -10 }, to: { x, y: 10 } }];
  }

  setVisionException(armyId: string, value: boolean): void {
    const army = this.armies.get(armyId);
    if (army) army.state.ignoresVisionBarriers = value;
  }

  async reloadLocalClones(sideId: string): Promise<number> {
    const client = this.clients.get(sideId);
    if (!client) throw new Error(`Client ${sideId} missing`);
    const visible = await this.visibleTo(sideId);
    const sources = [...this.armies.values()].map(roomArmyImage);
    await new LocalCloneReconciler(client, new UpdateOriginGuard()).reconcile(visible, sources);
    return client.items.length;
  }

  loseCoordinator(): void {
    for (const army of this.armies.values()) {
      if (army.state.status === "MOVING") army.state.status = "PAUSED";
    }
  }

  status(armyId: string) {
    return this.armies.get(armyId)?.state.status;
  }

  private setRelation(left: string, right: string, relation: SideRelation): void {
    this.relations[left] ??= {};
    this.relations[right] ??= {};
    this.relations[left][right] = relation;
    this.relations[right][left] = relation;
  }

  private requireRegistered(): void {
    if (!this.registered) throw new Error("Register armies first");
  }
}

export function createFourClientRoom(): FourClientRoom {
  return new FourClientRoom();
}
