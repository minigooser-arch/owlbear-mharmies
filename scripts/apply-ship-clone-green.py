from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text()
old = '''    await this.cloneReconciler.reconcile(visible, armies.map((record) => record.item));
    await this.reconcileOverlays(
'''
new = '''    const shipSources = sceneItems.filter((item) => (scene.ships ?? {})[item.id] !== undefined);
    const visibleSourceIds = new Set([...visible, ...visibleShips]);
    await this.cloneReconciler.reconcile(
      visibleSourceIds,
      [...armies.map((record) => record.item), ...shipSources]
    );
    await this.reconcileOverlays(
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one visibility reconciliation match, got {count}")
path.write_text(text.replace(old, new, 1))
