import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/shared/constants.ts",
  `export const SHIP_ROUTE_CANCEL_ACTION_ID = \`${"${SHIP_ROUTE_TOOL_ID}"}/cancel\`;\nexport const MAP_BRUSH_TOOL_ID =`,
  `export const SHIP_ROUTE_CANCEL_ACTION_ID = \`${"${SHIP_ROUTE_TOOL_ID}"}/cancel\`;\nexport const TRANSPORT_LANDING_TOOL_ID = \`${"${EXTENSION_ID}"}/transport-landing-tool\`;\nexport const TRANSPORT_LANDING_TOOL_MODE_ID = \`${"${TRANSPORT_LANDING_TOOL_ID}"}/select\`;\nexport const TRANSPORT_LANDING_SHIP_ID_KEY = \`${"${TRANSPORT_LANDING_TOOL_ID}"}/ship-id\`;\nexport const TRANSPORT_LANDING_ARMY_ID_KEY = \`${"${TRANSPORT_LANDING_TOOL_ID}"}/army-id\`;\nexport const TRANSPORT_LANDING_RETURN_TOOL_KEY = \`${"${TRANSPORT_LANDING_TOOL_ID}"}/return-tool\`;\nexport const MAP_BRUSH_TOOL_ID =`
);

replaceOnce(
  "src/ui/state/useExtensionState.ts",
  `  | { type: "EDIT_SHIP_ROUTE"; shipId: string }\n  | { type: "OPEN_MAP_BRUSH"; settings: MapBrushUiSettings }`,
  `  | { type: "EDIT_SHIP_ROUTE"; shipId: string }\n  | { type: "OPEN_TRANSPORT_LANDING"; shipId: string; armyId: string }\n  | { type: "OPEN_MAP_BRUSH"; settings: MapBrushUiSettings }`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `  const canEmbark = selectedEmbarkShipId !== "" && selectedEmbarkArmyId !== "";`,
  `  const canEmbark = selectedEmbarkShipId !== "" && selectedEmbarkArmyId !== "";\n  const disembarkTransports = ships.filter((ship) =>\n    ship.classId === "TRANSPORT" &&\n    ship.status === "READY" &&\n    ship.hp > 0 &&\n    ship.embarkedArmyId !== null &&\n    ship.movementRemaining > 0 &&\n    (role === "GM" || leaderSideIds.has(ship.sideId))\n  );`
);

replaceOnce(
  "src/ui/pages/FleetPage.tsx",
  `      {role === "GM" && (\n        <section className="registration-card fleet-registration" aria-label="Регистрация корабля">`,
  `      {disembarkTransports.length > 0 && (\n        <section className="registration-card fleet-registration" aria-labelledby="transport-disembark-title">\n          <div className="registration-copy">\n            <span className="registration-kicker">Перевозка войск</span>\n            <h3 id="transport-disembark-title">Высадка армии</h3>\n            <small>Выберите место высадки кликом по клетке карты. Допустимость клетки проверяется сервером.</small>\n          </div>\n          <div className="registration-actions fleet-registration-actions">\n            {disembarkTransports.map((ship) => (\n              <button\n                key={ship.id}\n                className="button primary"\n                type="button"\n                onClick={() => {\n                  if (!ship.embarkedArmyId) return;\n                  onAction({\n                    type: "OPEN_TRANSPORT_LANDING",\n                    shipId: ship.id,\n                    armyId: ship.embarkedArmyId\n                  });\n                }}\n              >\n                Выбрать место высадки\n              </button>\n            ))}\n          </div>\n        </section>\n      )}\n\n      {role === "GM" && (\n        <section className="registration-card fleet-registration" aria-label="Регистрация корабля">`
);

replaceOnce(
  "src/owlbear/extensionServices.ts",
  `  SHIP_ROUTE_RETURN_TOOL_KEY,\n  SHIP_ROUTE_SHIP_ID_KEY,\n  SHIP_ROUTE_TOOL_ID,\n  SHIP_ROUTE_TOOL_MODE_ID`,
  `  SHIP_ROUTE_RETURN_TOOL_KEY,\n  SHIP_ROUTE_SHIP_ID_KEY,\n  SHIP_ROUTE_TOOL_ID,\n  SHIP_ROUTE_TOOL_MODE_ID,\n  TRANSPORT_LANDING_ARMY_ID_KEY,\n  TRANSPORT_LANDING_RETURN_TOOL_KEY,\n  TRANSPORT_LANDING_SHIP_ID_KEY,\n  TRANSPORT_LANDING_TOOL_ID,\n  TRANSPORT_LANDING_TOOL_MODE_ID`
);

replaceOnce(
  "src/owlbear/extensionServices.ts",
  `      if (command.type === "EDIT_SHIP_ROUTE") {\n        const returnToolId = await OBR.tool.getActiveTool();\n        try {\n          await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {\n            [SHIP_ROUTE_SHIP_ID_KEY]: command.shipId,\n            [SHIP_ROUTE_RETURN_TOOL_KEY]: returnToolId\n          });\n          await OBR.tool.activateTool(SHIP_ROUTE_TOOL_ID);\n          await OBR.tool.activateMode(SHIP_ROUTE_TOOL_ID, SHIP_ROUTE_TOOL_MODE_ID);\n        } catch (error) {\n          try {\n            await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {\n              [SHIP_ROUTE_SHIP_ID_KEY]: null,\n              [SHIP_ROUTE_RETURN_TOOL_KEY]: null\n            });\n          } catch {\n            // The original activation failure is more useful to the caller.\n          }\n          throw error;\n        }\n        return undefined;\n      }\n      let payload: ArmyCommandPayload;`,
  `      if (command.type === "EDIT_SHIP_ROUTE") {\n        const returnToolId = await OBR.tool.getActiveTool();\n        try {\n          await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {\n            [SHIP_ROUTE_SHIP_ID_KEY]: command.shipId,\n            [SHIP_ROUTE_RETURN_TOOL_KEY]: returnToolId\n          });\n          await OBR.tool.activateTool(SHIP_ROUTE_TOOL_ID);\n          await OBR.tool.activateMode(SHIP_ROUTE_TOOL_ID, SHIP_ROUTE_TOOL_MODE_ID);\n        } catch (error) {\n          try {\n            await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {\n              [SHIP_ROUTE_SHIP_ID_KEY]: null,\n              [SHIP_ROUTE_RETURN_TOOL_KEY]: null\n            });\n          } catch {\n            // The original activation failure is more useful to the caller.\n          }\n          throw error;\n        }\n        return undefined;\n      }\n      if (command.type === "OPEN_TRANSPORT_LANDING") {\n        const returnToolId = await OBR.tool.getActiveTool();\n        try {\n          await OBR.tool.setMetadata(TRANSPORT_LANDING_TOOL_ID, {\n            [TRANSPORT_LANDING_SHIP_ID_KEY]: command.shipId,\n            [TRANSPORT_LANDING_ARMY_ID_KEY]: command.armyId,\n            [TRANSPORT_LANDING_RETURN_TOOL_KEY]: returnToolId\n          });\n          await OBR.tool.activateTool(TRANSPORT_LANDING_TOOL_ID);\n          await OBR.tool.activateMode(TRANSPORT_LANDING_TOOL_ID, TRANSPORT_LANDING_TOOL_MODE_ID);\n        } catch (error) {\n          try {\n            await OBR.tool.setMetadata(TRANSPORT_LANDING_TOOL_ID, {\n              [TRANSPORT_LANDING_SHIP_ID_KEY]: null,\n              [TRANSPORT_LANDING_ARMY_ID_KEY]: null,\n              [TRANSPORT_LANDING_RETURN_TOOL_KEY]: null\n            });\n          } catch {\n            // The original activation failure is more useful to the caller.\n          }\n          throw error;\n        }\n        return undefined;\n      }\n      let payload: ArmyCommandPayload;`
);

replaceOnce(
  "src/background/application.ts",
  `import {\n  registerShipRouteTool,\n  type ShipRouteToolRegistration\n} from "../owlbear/shipRouteToolIntegration";`,
  `import {\n  registerShipRouteTool,\n  type ShipRouteToolRegistration\n} from "../owlbear/shipRouteToolIntegration";\nimport {\n  registerTransportLandingTool,\n  type TransportLandingToolRegistration\n} from "../owlbear/transportLandingTool";`
);

replaceOnce(
  "src/background/application.ts",
  `import { ShipRouteToolService } from "./shipRouteToolService";`,
  `import { ShipRouteToolService } from "./shipRouteToolService";\nimport { TransportLandingToolService } from "./transportLandingToolService";`
);

replaceOnce(
  "src/background/application.ts",
  `  let removeMapBrushTool: MapBrushToolRegistration;\n  try {`,
  `  const transportLandingService = new TransportLandingToolService(toolPort, routeGateway);\n  let removeTransportLandingTool: TransportLandingToolRegistration;\n  try {\n    removeTransportLandingTool = await registerTransportLandingTool(\n      OBR.tool,\n      transportLandingService,\n      \`${"${import.meta.env.BASE_URL}"}icon-1.2.png\`\n    );\n  } catch (error) {\n    await removeShipRouteTool();\n    await removeRouteTool();\n    routeGateway.stop();\n    throw error;\n  }\n  let removeMapBrushTool: MapBrushToolRegistration;\n  try {`
);

replaceOnce(
  "src/background/application.ts",
  `  } catch (error) {\n    await removeShipRouteTool();\n    await removeRouteTool();\n    routeGateway.stop();\n    throw error;\n  }\n  let removeNavalBattleAreaTool: NavalBattleAreaToolRegistration;`,
  `  } catch (error) {\n    await removeTransportLandingTool();\n    await removeShipRouteTool();\n    await removeRouteTool();\n    routeGateway.stop();\n    throw error;\n  }\n  let removeNavalBattleAreaTool: NavalBattleAreaToolRegistration;`
);

replaceOnce(
  "src/background/application.ts",
  `  } catch (error) {\n    await removeMapBrushTool();\n    await removeShipRouteTool();\n    await removeRouteTool();`,
  `  } catch (error) {\n    await removeMapBrushTool();\n    await removeTransportLandingTool();\n    await removeShipRouteTool();\n    await removeRouteTool();`
);

replaceOnce(
  "src/background/application.ts",
  `          removeRouteTool.cancelSession(),\n          removeShipRouteTool.cancelSession()`,
  `          removeRouteTool.cancelSession(),\n          removeShipRouteTool.cancelSession(),\n          removeTransportLandingTool.cancelSession()`
);

replaceOnce(
  "src/background/application.ts",
  `          removeRouteTool.cancelSession(),\n          removeShipRouteTool.cancelSession()`,
  `          removeRouteTool.cancelSession(),\n          removeShipRouteTool.cancelSession(),\n          removeTransportLandingTool.cancelSession()`
);

replaceOnce(
  "src/background/application.ts",
  `          await removeNavalBattleAreaTool();\n          await removeMapBrushTool();\n          await removeShipRouteTool();`,
  `          await removeNavalBattleAreaTool();\n          await removeMapBrushTool();\n          await removeTransportLandingTool();\n          await removeShipRouteTool();`
);
