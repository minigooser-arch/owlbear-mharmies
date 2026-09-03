from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text(encoding="utf-8")

old_import = 'import { SHIP_CLASSES } from "../naval/ships/shipClasses";\n'
new_import = old_import + 'import { rotationForFacing } from "../naval/ships/shipRotation";\n'
if text.count(old_import) != 1:
    raise SystemExit(f"expected one shipClasses import, found {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

old_patch = '''        await this.port.patchSceneItemMetadata(
          shipId,
          METADATA_KEYS.ship,
          state,
          { visible: state === undefined, ...(nextPosition ? { position: nextPosition } : {}) },
          previousState?.revision ?? null
        );
        applied.push({
          itemId: shipId,
          key: METADATA_KEYS.ship,
          previousValue: previousState,
          rollbackUpdate: { visible: item.visible ?? true, ...(previousPosition ? { position: previousPosition } : {}) },
          expectedRevision: state?.revision ?? null
        });
'''
new_patch = '''        await this.port.patchSceneItemMetadata(
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
'''
if text.count(old_patch) != 1:
    raise SystemExit(f"expected one ship persistence block, found {text.count(old_patch)}")
text = text.replace(old_patch, new_patch, 1)
path.write_text(text, encoding="utf-8")
