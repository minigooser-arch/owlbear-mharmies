from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text()
old = '''    const graph = await buildDetectionGraph({
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
'''
new = '''    const sceneItemById = new Map(sceneItems.map((item) => [item.id, item]));
    const armyDetectionUnits = armies.map(({ item, state }) => ({
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
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one detection graph block, got {text.count(old)}")
text = text.replace(old, new, 1)
old2 = '''      detectionGraph: { visibleTargetsBySide: new Map(), observersBySide: new Map() },
'''
new2 = '''      detectionGraph: graph,
'''
if text.count(old2) != 1:
    raise SystemExit(f"expected one empty naval detection graph, got {text.count(old2)}")
text = text.replace(old2, new2, 1)
path.write_text(text)
