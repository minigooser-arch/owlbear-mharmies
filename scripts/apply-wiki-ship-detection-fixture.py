from pathlib import Path

path = Path("src/ui/wikiLightRedesign.test.tsx")
text = path.read_text(encoding="utf-8")
old = '''      normalRangeMax: 3,\n      embarkedArmyId: null\n'''
new = '''      normalRangeMax: 3,\n      embarkedArmyId: null,\n      detectionOverride: null,\n      effectiveDetectionRange: DEFAULT_SETTINGS.defaultDetectionRangeCells\n'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one wiki ship fixture anchor, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
