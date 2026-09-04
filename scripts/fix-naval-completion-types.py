from pathlib import Path

path = Path('src/commands/commandProcessor.ts')
text = path.read_text(encoding='utf-8')
old = '''        const sceneRevision = state.scene.revision;
        const completed = completeNavalBattle(state.scene as NavalSceneState);
        completed.revision = sceneRevision;
        state.scene = completed;
        state.positions ??= {};
        for (const [shipId, snapshot] of Object.entries(battle.snapshots)) {
          const ship = state.scene.ships?.[shipId];
          if (!ship) continue;
          state.scene.ships[shipId] = {
            ...ship,
            facing: snapshot.strategicFacing
          };
          state.positions[shipId] = { ...snapshot.strategicPosition };
        }
        return undefined;
'''
new = '''        const sceneRevision = state.scene.revision;
        const completed = completeNavalBattle(state.scene as NavalSceneState);
        completed.revision = sceneRevision;
        state.positions ??= {};
        for (const [shipId, snapshot] of Object.entries(battle.snapshots)) {
          const ship = completed.ships[shipId];
          if (!ship) continue;
          completed.ships[shipId] = {
            ...ship,
            facing: snapshot.strategicFacing
          };
          state.positions[shipId] = { ...snapshot.strategicPosition };
        }
        state.scene = completed;
        return undefined;
'''
if text.count(old) != 1:
    raise SystemExit(f'expected one completion block, found {text.count(old)}')
path.write_text(text.replace(old, new), encoding='utf-8')
