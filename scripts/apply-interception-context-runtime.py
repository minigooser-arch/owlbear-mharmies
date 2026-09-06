from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        'import { NavalBattleAreaToolService } from "./navalBattleAreaToolService";\n',
        'import { NavalBattleAreaToolService } from "./navalBattleAreaToolService";\nimport { NavalInterceptionContextMenuService } from "./navalInterceptionContextMenuService";\n',
    ),
    (
        'export interface BackgroundApplication {\n  stop(): Promise<void>;\n}',
        'export interface BackgroundApplication {\n  activateInterception(shipId: string): Promise<void>;\n  stop(): Promise<void>;\n}',
    ),
    (
        '    getPlayerIdentity: async () => {\n      const [id, role, currentConnectionId] = await Promise.all([\n        OBR.player.getId(),\n        OBR.player.getRole(),\n        OBR.player.getConnectionId()\n      ]);\n      return { id, role, connectionId: currentConnectionId };\n    },\n    createId: () => crypto.randomUUID(),',
        '    getPlayerIdentity: async () => {\n      const [id, role, currentConnectionId] = await Promise.all([\n        OBR.player.getId(),\n        OBR.player.getRole(),\n        OBR.player.getConnectionId()\n      ]);\n      return { id, role, connectionId: currentConnectionId };\n    },\n    getSceneRevision: async () => (await new MetadataRepository(port).readScene()).revision,\n    createId: () => crypto.randomUUID(),',
    ),
    (
        '  });\n  const routeService = new RouteToolService(toolPort, routeGateway);',
        '  });\n  const interceptionContextMenuService = new NavalInterceptionContextMenuService(toolPort, routeGateway);\n  const routeService = new RouteToolService(toolPort, routeGateway);',
    ),
    (
        '  return {\n    stop: () => {',
        '  return {\n    activateInterception: (shipId) => interceptionContextMenuService.activateInterception(shipId),\n    stop: () => {',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match, found {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
