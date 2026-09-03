from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text()

replacements: list[tuple[str, str]] = []

replacements.append((
    'import { HealthOverlayService } from "../health/healthOverlayService";\n',
    'import { HealthOverlayService } from "../health/healthOverlayService";\n'
    'import { NavalShipOverlayService } from "../naval/ships/navalShipOverlayService";\n'
    'import { SHIP_CLASSES } from "../naval/ships/shipClasses";\n'
    'import { visibleShipIdsForPlayer } from "../naval/detection/navalVisibility";\n'
))

replacements.append((
    '    METADATA_KEYS.healthOverlay,\n    METADATA_KEYS.mapBrushPreview\n',
    '    METADATA_KEYS.healthOverlay,\n    METADATA_KEYS.navalShipOverlay,\n    METADATA_KEYS.mapBrushPreview\n'
))

old_visibility = '''  async visibilityTick(role: "GM" | "PLAYER", playerId: string): Promise<void> {
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
    await this.reconcileOverlays(scene, armies, barriers, role, memberSideIds, leaderSideIds, visible);
  }
'''

new_visibility = '''  async visibilityTick(role: "GM" | "PLAYER", playerId: string): Promise<void> {
    const [scene, armies, barriers, sceneItems] = await Promise.all([
      this.repository.readScene(),
      this.repository.readArmies(),
      this.repository.readBarriers(),
      this.port.getSceneItems()
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
    const visibleShips = visibleShipIdsForPlayer({
      isGM: role === "GM",
      playerSideIds: memberSideIds,
      ships: scene.ships ?? {},
      detectionGraph: { visibleTargetsBySide: new Map(), observersBySide: new Map() },
      revealUntilTurn: scene.navalRevealUntilTurn ?? {},
      currentTurn: scene.turn.turnNumber
    });
    await this.cloneReconciler.reconcile(visible, armies.map((record) => record.item));
    await this.reconcileOverlays(
      scene,
      armies,
      barriers,
      role,
      memberSideIds,
      leaderSideIds,
      visible,
      sceneItems,
      visibleShips
    );
  }
'''
replacements.append((old_visibility, new_visibility))

replacements.append((
    '''    leaderSideIds: readonly string[],
    visibleArmyIds: ReadonlySet<string>
  ): Promise<void> {''',
    '''    leaderSideIds: readonly string[],
    visibleArmyIds: ReadonlySet<string>,
    sceneItems: readonly SceneItemRecord[],
    visibleShipIds: ReadonlySet<string>
  ): Promise<void> {'''
))

health_block = '''    await new HealthOverlayService(overlayPort).reconcile(
      armies.map((record) => ({
        armyId: record.item.id,
        position: record.item.position,
        hp: record.state.health.hp,
        maxHp: record.state.health.maxHp,
        color: sideColors.get(record.state.sideId) ?? "#ffffff"
      })),
      visibleArmyIds
    );

'''

naval_block = health_block + '''    const sceneItemById = new Map(sceneItems.map((item) => [item.id, item]));
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

'''
replacements.append((health_block, naval_block))

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one runtime patch match, got {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)

path.write_text(text)
