from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "src/ui/state/useExtensionState.ts",
    '''  embarkedArmyId: string | null;\n  navalRoundNumber?: number;\n''',
    '''  embarkedArmyId: string | null;\n  detectionOverride: number | null;\n  effectiveDetectionRange: number;\n  navalRoundNumber?: number;\n''',
    "ShipView detection fields"
)

replace_once(
    "src/owlbear/extensionServices.ts",
    '''      normalRangeMax: definition.normalRangeMax,\n      embarkedArmyId: state.embarkedArmyId,\n      ...tactical\n''',
    '''      normalRangeMax: definition.normalRangeMax,\n      embarkedArmyId: state.embarkedArmyId,\n      detectionOverride: state.detectionOverride,\n      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,\n      ...tactical\n''',
    "ship snapshot detection fields"
)

replace_once(
    "src/ui/components/ShipCard.tsx",
    '''function ShipHealthEditor({\n''',
    '''function ShipDetectionEditor({\n  ship,\n  onAction\n}: {\n  ship: ShipView;\n  onAction(command: UiCommand): void;\n}) {\n  const [draft, setDraft] = useState(String(ship.effectiveDetectionRange));\n  useEffect(() => setDraft(String(ship.effectiveDetectionRange)), [ship.effectiveDetectionRange]);\n  const parsed = Number(draft);\n  const canSubmit =\n    draft.trim() !== "" &&\n    Number.isFinite(parsed) &&\n    parsed >= 0 &&\n    parsed !== ship.effectiveDetectionRange;\n\n  return (\n    <div className="hp-editor" aria-label="Управление дальностью обнаружения корабля">\n      <div className="hp-editor-heading">\n        <strong>Дальность обнаружения</strong>\n        <span>\n          {ship.detectionOverride === null\n            ? `Общая дальность: ${ship.effectiveDetectionRange} кл.`\n            : `Индивидуальная: ${ship.effectiveDetectionRange} кл.`}\n        </span>\n      </div>\n      <input\n        aria-label={`Дальность обнаружения ${ship.name}`}\n        type="number"\n        min="0"\n        step="any"\n        value={draft}\n        onChange={(event) => setDraft(event.target.value)}\n      />\n      <button\n        className="button subtle wide"\n        type="button"\n        disabled={!canSubmit}\n        onClick={() => onAction({\n          type: "SET_SHIP_DETECTION_OVERRIDE",\n          shipId: ship.id,\n          detectionOverride: parsed\n        })}\n      >\n        Установить дальность обнаружения\n      </button>\n      <button\n        className="button subtle wide"\n        type="button"\n        disabled={ship.detectionOverride === null}\n        onClick={() => onAction({\n          type: "SET_SHIP_DETECTION_OVERRIDE",\n          shipId: ship.id,\n          detectionOverride: null\n        })}\n      >\n        Использовать общую дальность\n      </button>\n    </div>\n  );\n}\n\nfunction ShipHealthEditor({\n''',
    "ShipDetectionEditor component"
)

replace_once(
    "src/ui/components/ShipCard.tsx",
    '''            <ShipHealthEditor ship={ship} onAction={onAction} />\n            <div className="card-actions">\n''',
    '''            <ShipHealthEditor ship={ship} onAction={onAction} />\n            <ShipDetectionEditor ship={ship} onAction={onAction} />\n            <div className="card-actions">\n''',
    "ShipDetectionEditor placement"
)

for path_str, anchor in [
    ("src/ui/components/ShipCard.test.tsx", '''  embarkedArmyId: null\n'''),
    ("src/ui/pages/FleetPage.test.tsx", '''    embarkedArmyId: null,\n''')
]:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    if path_str.endswith("ShipCard.test.tsx"):
        new = '''  embarkedArmyId: null,\n  detectionOverride: null,\n  effectiveDetectionRange: 6\n'''
    else:
        new = '''    embarkedArmyId: null,\n    detectionOverride: null,\n    effectiveDetectionRange: 6,\n'''
    count = text.count(anchor)
    if count != 1:
        raise SystemExit(f"{path_str}: expected exactly one fixture anchor, found {count}")
    path.write_text(text.replace(anchor, new, 1), encoding="utf-8")
