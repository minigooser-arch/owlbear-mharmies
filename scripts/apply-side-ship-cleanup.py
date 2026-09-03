from pathlib import Path

path = Path("src/commands/commandProcessor.ts")
text = path.read_text(encoding="utf-8")
old = '''          state.scene.battleGroups = state.scene.battleGroups
            .map((group) => {
              const participantIds = group.participantIds.filter(
                (armyId) => !removedArmyIds.has(armyId)
              );
              if (participantIds.length === group.participantIds.length) return group;
              return {
                ...group,
                participantIds,
                revision: group.revision + 1
              };
            })
            .filter((group) => group.participantIds.length >= 2);
        }
        state.scene.sides = state.scene.sides.filter((side) => side.id !== command.sideId);'''
new = '''          state.scene.battleGroups = state.scene.battleGroups
            .map((group) => {
              const participantIds = group.participantIds.filter(
                (armyId) => !removedArmyIds.has(armyId)
              );
              if (participantIds.length === group.participantIds.length) return group;
              return {
                ...group,
                participantIds,
                revision: group.revision + 1
              };
            })
            .filter((group) => group.participantIds.length >= 2);

          const sceneRevision = state.scene.revision;
          const removedShipIds = Object.entries(state.scene.ships ?? {})
            .filter(([, ship]) => ship.sideId === command.sideId)
            .map(([shipId]) => shipId);
          for (const shipId of removedShipIds) {
            const destroyed = destroyShip(state.scene as NavalSceneState, shipId);
            state.scene = destroyed.scene;
            state.scene.revision = sceneRevision;
          }
        }
        state.scene.sides = state.scene.sides.filter((side) => side.id !== command.sideId);'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one DELETE_SIDE cleanup site, found {count}")
path.write_text(text.replace(old, new), encoding="utf-8")
