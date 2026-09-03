from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# extensionServices: constants + local tool activation.
replace_once(
    "src/owlbear/extensionServices.ts",
    "  ROUTE_TOOL_ID,\n  ROUTE_TOOL_MODE_ID\n} from \"../shared/constants\";",
    "  ROUTE_TOOL_ID,\n  ROUTE_TOOL_MODE_ID,\n  SHIP_ROUTE_RETURN_TOOL_KEY,\n  SHIP_ROUTE_SHIP_ID_KEY,\n  SHIP_ROUTE_TOOL_ID,\n  SHIP_ROUTE_TOOL_MODE_ID\n} from \"../shared/constants\";"
)
replace_once(
    "src/owlbear/extensionServices.ts",
    "      let payload: ArmyCommandPayload;",
    """      if (command.type === \"EDIT_SHIP_ROUTE\") {
        const returnToolId = await OBR.tool.getActiveTool();
        try {
          await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {
            [SHIP_ROUTE_SHIP_ID_KEY]: command.shipId,
            [SHIP_ROUTE_RETURN_TOOL_KEY]: returnToolId
          });
          await OBR.tool.activateTool(SHIP_ROUTE_TOOL_ID);
          await OBR.tool.activateMode(SHIP_ROUTE_TOOL_ID, SHIP_ROUTE_TOOL_MODE_ID);
        } catch (error) {
          try {
            await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {
              [SHIP_ROUTE_SHIP_ID_KEY]: null,
              [SHIP_ROUTE_RETURN_TOOL_KEY]: null
            });
          } catch {
            // The original activation failure is more useful to the caller.
          }
          throw error;
        }
        return undefined;
      }
      let payload: ArmyCommandPayload;"""
)

# extensionServices test: prove the ship action configures and activates the dedicated tool.
replace_once(
    "src/owlbear/extensionServices.test.ts",
    "  ROUTE_TOOL_ID,\n  ROUTE_TOOL_MODE_ID\n} from \"../shared/constants\";",
    "  ROUTE_TOOL_ID,\n  ROUTE_TOOL_MODE_ID,\n  SHIP_ROUTE_RETURN_TOOL_KEY,\n  SHIP_ROUTE_SHIP_ID_KEY,\n  SHIP_ROUTE_TOOL_ID,\n  SHIP_ROUTE_TOOL_MODE_ID\n} from \"../shared/constants\";"
)
replace_once(
    "src/owlbear/extensionServices.test.ts",
    """  it(\"clears route metadata when tool activation fails\", async () => {""",
    """  it(\"activates the ship route tool with the ship and previous tool metadata\", async () => {
    const running = await startServices();

    await running.send({ type: \"EDIT_SHIP_ROUTE\", shipId: \"ship-a\" });

    expect(serviceHarness.sdk.tool.setMetadata).toHaveBeenCalledWith(SHIP_ROUTE_TOOL_ID, {
      [SHIP_ROUTE_SHIP_ID_KEY]: \"ship-a\",
      [SHIP_ROUTE_RETURN_TOOL_KEY]: \"select-tool\"
    });
    expect(serviceHarness.sdk.tool.activateTool).toHaveBeenCalledWith(SHIP_ROUTE_TOOL_ID);
    expect(serviceHarness.sdk.tool.activateMode).toHaveBeenCalledWith(
      SHIP_ROUTE_TOOL_ID,
      SHIP_ROUTE_TOOL_MODE_ID
    );
    expect(serviceHarness.adapter.send).not.toHaveBeenCalled();
  });

  it(\"clears route metadata when tool activation fails\", async () => {"""
)

# Background imports.
replace_once(
    "src/background/application.ts",
    "import { NavalShipOverlayService } from \"../naval/ships/navalShipOverlayService\";",
    "import { NavalShipOverlayService } from \"../naval/ships/navalShipOverlayService\";\nimport { ShipRouteOverlayService } from \"../naval/ships/shipRouteOverlayService\";"
)
replace_once(
    "src/background/application.ts",
    """import {
  registerRouteTool,
  type RouteToolRegistration
} from \"../owlbear/routeToolIntegration\";""",
    """import {
  registerRouteTool,
  type RouteToolRegistration
} from \"../owlbear/routeToolIntegration\";
import {
  registerShipRouteTool,
  type ShipRouteToolRegistration
} from \"../owlbear/shipRouteToolIntegration\";"""
)
replace_once(
    "src/background/application.ts",
    """import {
  RouteToolService,
  snapRouteToGrid
} from \"./routeToolService\";""",
    """import {
  RouteToolService,
  snapRouteToGrid
} from \"./routeToolService\";
import { ShipRouteToolService } from \"./shipRouteToolService\";"""
)

# Background overlay cleanup recognizes both ship route overlay kinds.
replace_once(
    "src/background/application.ts",
    """    METADATA_KEYS.routeOverlay,
    METADATA_KEYS.routePreview,
    METADATA_KEYS.barrierOverlay,""",
    """    METADATA_KEYS.routeOverlay,
    METADATA_KEYS.routePreview,
    METADATA_KEYS.shipRouteOverlay,
    METADATA_KEYS.shipRoutePreview,
    METADATA_KEYS.barrierOverlay,"""
)

# Persistent confirmed route overlay: GM + owning faction leaders only.
replace_once(
    "src/background/application.ts",
    """    await new BarrierOverlayService(overlayPort).reconcile(""",
    """    const plannedShips = Object.entries(scene.ships ?? {}).filter(([, state]) => state.plannedRoute.length > 0);
    const shipRouteViewer = { isGM: role === \"GM\", leaderSideIds };
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
              color: sideColors.get(state.sideId) ?? \"#607d8b\",
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

    await new BarrierOverlayService(overlayPort).reconcile("""
)

# Register the dedicated ship route tool before the map brush.
replace_once(
    "src/background/application.ts",
    """  let removeMapBrushTool: MapBrushToolRegistration;
  try {
    removeMapBrushTool = await registerMapBrushTool(""",
    """  const shipRouteService = new ShipRouteToolService(toolPort, routeGateway);
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
  let removeMapBrushTool: MapBrushToolRegistration;
  try {
    removeMapBrushTool = await registerMapBrushTool("""
)
replace_once(
    "src/background/application.ts",
    """  } catch (error) {
    await removeRouteTool();
    routeGateway.stop();
    throw error;
  }
  const coordinatorListeners""",
    """  } catch (error) {
    await removeShipRouteTool();
    await removeRouteTool();
    routeGateway.stop();
    throw error;
  }
  const coordinatorListeners"""
)

# Scene lifecycle cancels both route editors.
replace_once(
    "src/background/application.ts",
    """      try {
        await removeRouteTool.cancelSession();
      } catch {
        // A stale preview must not disable command delivery or coordinator heartbeats.
      }
      commandReady = true;""",
    """      try {
        await Promise.all([
          removeRouteTool.cancelSession(),
          removeShipRouteTool.cancelSession()
        ]);
      } catch {
        // A stale preview must not disable command delivery or coordinator heartbeats.
      }
      commandReady = true;"""
)
replace_once(
    "src/background/application.ts",
    """      try {
        await removeRouteTool.cancelSession();
      } catch {
        // Scene teardown continues so subscriptions and overlays can still be cleaned up.
      }
    },""",
    """      try {
        await Promise.all([
          removeRouteTool.cancelSession(),
          removeShipRouteTool.cancelSession()
        ]);
      } catch {
        // Scene teardown continues so subscriptions and overlays can still be cleaned up.
      }
    },"""
)

# Final teardown removes all three tools.
replace_once(
    "src/background/application.ts",
    """          await removeMapBrushTool();
          await removeRouteTool();""",
    """          await removeMapBrushTool();
          await removeShipRouteTool();
          await removeRouteTool();"""
)

# Remove this one-shot patch machinery from the resulting commit.
Path("scripts/apply-ship-route-runtime-wiring.py").unlink(missing_ok=True)
Path(".github/workflows/ship-route-runtime-wiring.yml").unlink(missing_ok=True)
