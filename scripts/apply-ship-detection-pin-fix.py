from pathlib import Path

path = Path("src/ui/components/ShipCard.tsx")
text = path.read_text(encoding="utf-8")
old = '''  const canSubmit =
    draft.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed !== ship.effectiveDetectionRange;
'''
new = '''  const canSubmit =
    draft.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    (ship.detectionOverride === null || parsed !== ship.detectionOverride);
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one ship detection canSubmit block, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
