from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# Command payload types.
replace_once(
    "src/shared/types.ts",
    '    | { type: "UNREGISTER_ARMY"; armyId: string }\n',
    '    | { type: "UNREGISTER_ARMY"; armyId: string }\n'
    '    | { type: "REGISTER_SHIP"; itemId: string; sideId: string; classId: ShipClassId; facing: ShipFacing }\n'
    '    | { type: "UNREGISTER_SHIP"; shipId: string }\n'
)

# Payload validation.
replace_once(
    "src/commands/commandValidation.ts",
    '''  UNREGISTER_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "UNREGISTER_ARMY", armyId } : undefined;
  },
  CREATE_SIDE: (value) => {
''',
    '''  UNREGISTER_ARMY: (value) => {
    const armyId = armyIdOnly(value);
    return armyId ? { type: "UNREGISTER_ARMY", armyId } : undefined;
  },
  REGISTER_SHIP: (value) =>
    boundedString(value.itemId) &&
    sideId(value.sideId) &&
    (value.classId === "BATTLESHIP" ||
      value.classId === "CRUISER" ||
      value.classId === "IRONCLAD" ||
      value.classId === "HOSPITAL" ||
      value.classId === "TRANSPORT") &&
    (value.facing === "NORTH" ||
      value.facing === "EAST" ||
      value.facing === "SOUTH" ||
      value.facing === "WEST")
      ? {
          type: "REGISTER_SHIP",
          itemId: value.itemId,
          sideId: value.sideId,
          classId: value.classId,
          facing: value.facing
        }
      : undefined,
  UNREGISTER_SHIP: (value) =>
    boundedString(value.shipId)
      ? { type: "UNREGISTER_SHIP", shipId: value.shipId }
      : undefined,
  CREATE_SIDE: (value) => {
'''
)

# Processor imports.
replace_once(
    "src/commands/commandProcessor.ts",
    'import { unenteredRouteCells } from "../movement/strategicProgress";\n',
    'import { unenteredRouteCells } from "../movement/strategicProgress";\n'
    'import { createRegisteredShip, destroyShip } from "../naval/ships/shipLifecycle";\n'
    'import { cellSupportsDomain } from "../terrain/movementDomains";\n'
)
replace_once(
    "src/commands/commandProcessor.ts",
    '''  SceneItemRecord,
  SceneState,
  GridCellCoord,
''',
    '''  SceneItemRecord,
  SceneState,
  NavalSceneState,
  GridCellCoord,
'''
)

# Processor command cases.
replace_once(
    "src/commands/commandProcessor.ts",
    '''      case "UNREGISTER_ARMY": {
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
        state.armies = destroyed.armies;
        state.scene.battleGroups = destroyed.battleGroups;
        return undefined;
      }
      case "CREATE_SIDE":
''',
    '''      case "UNREGISTER_ARMY": {
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
        state.armies = destroyed.armies;
        state.scene.battleGroups = destroyed.battleGroups;
        return undefined;
      }
      case "REGISTER_SHIP": {
        const item = state.items[command.itemId];
        if (!item) return "ITEM_NOT_FOUND";
        if (item.type !== "IMAGE") return "IMAGE_REQUIRED";
        state.scene.ships ??= {};
        if (
          state.armies[command.itemId] ||
          item.metadata[METADATA_KEYS.army] !== undefined ||
          state.scene.ships[command.itemId] ||
          item.metadata[METADATA_KEYS.ship] !== undefined
        ) {
          return "ALREADY_REGISTERED";
        }
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        if (!this.cellForPosition) return "SHIP_REQUIRES_SEA";
        const cell = this.cellForPosition(item.position);
        if (!cellSupportsDomain(state.scene, cell, "SEA")) return "SHIP_REQUIRES_SEA";
        state.scene.ships[command.itemId] = createRegisteredShip(
          command.sideId,
          command.classId,
          command.facing
        );
        return undefined;
      }
      case "UNREGISTER_SHIP": {
        if (!state.scene.ships?.[command.shipId]) return "SHIP_NOT_FOUND";
        const sceneRevision = state.scene.revision;
        const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);
        state.scene = destroyed.scene;
        state.scene.revision = sceneRevision;
        return undefined;
      }
      case "CREATE_SIDE":
'''
)
