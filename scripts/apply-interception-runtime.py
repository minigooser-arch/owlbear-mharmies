from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text()

import_anchor = 'import { NavalShipOverlayService } from "../naval/ships/navalShipOverlayService";\n'
import_replacement = import_anchor + 'import { InterceptionOverlayService } from "../naval/interception/interceptionOverlayService";\n'
if text.count(import_anchor) != 1:
    raise SystemExit("unexpected NavalShipOverlayService import anchor count")
text = text.replace(import_anchor, import_replacement, 1)

cleanup_anchor = '    METADATA_KEYS.navalShipOverlay,\n    METADATA_KEYS.mapBrushPreview,\n'
cleanup_replacement = '    METADATA_KEYS.navalShipOverlay,\n    METADATA_KEYS.interceptionOverlay,\n    METADATA_KEYS.mapBrushPreview,\n'
if text.count(cleanup_anchor) != 1:
    raise SystemExit("unexpected localOverlayIds anchor count")
text = text.replace(cleanup_anchor, cleanup_replacement, 1)

overlay_anchor = '''    await new NavalShipOverlayService(overlayPort).reconcile(
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
'''

overlay_replacement = '''    await new NavalShipOverlayService(overlayPort).reconcile(
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

    const interceptionViewer = { isGM: role === "GM", leaderSideIds };
    const activeInterceptions = Object.values(scene.activeNavalBattle?.interceptions ?? {});
    const canViewActiveInterception = role === "GM" || activeInterceptions.some((interception) => {
      const cruiser = (scene.ships ?? {})[interception.cruiserShipId];
      return cruiser !== undefined && leaderSideIds.includes(cruiser.sideId);
    });
    const interceptionOverlayService = new InterceptionOverlayService(overlayPort);
    if (
      scene.activeNavalBattle?.status !== "ACTIVE" ||
      activeInterceptions.length === 0 ||
      !canViewActiveInterception
    ) {
      await interceptionOverlayService.reconcile(undefined, interceptionViewer);
    } else {
      try {
        const shipPositions = Object.fromEntries(
          Object.keys(scene.ships ?? {}).flatMap((shipId) => {
            const item = sceneItemById.get(shipId);
            return item ? [[shipId, item.position] as const] : [];
          })
        );
        await interceptionOverlayService.reconcile(
          {
            dpi: await this.grid.getDpi(),
            scene: scene as import("../shared/types").NavalSceneState,
            shipPositions
          },
          interceptionViewer
        );
      } catch {
        // Preserve the last valid authorized interception overlay while grid geometry is unavailable.
      }
    }

    const mapOverlayService = new MapOverlayService(overlayPort);
'''
if text.count(overlay_anchor) != 1:
    raise SystemExit("unexpected naval overlay anchor count")
text = text.replace(overlay_anchor, overlay_replacement, 1)

path.write_text(text)
