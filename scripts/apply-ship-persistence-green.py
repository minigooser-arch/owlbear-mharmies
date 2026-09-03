from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))

# 1) Public ShipState validation for token metadata.
replace_once(
    "src/shared/validation.ts",
    '''function normalizeShips(value: unknown): Record<string, ShipState> {
''',
    '''export function normalizeShipState(raw: unknown): ValidationResult<ShipState> {
  if (!isRecord(raw)) return { ok: false, issue: { code: "INVALID_VALUE", path: "ship" } };
  if (finiteNumber(raw.version) && raw.version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version: raw.version } };
  }
  const ship = normalizeShip(raw);
  return ship
    ? { ok: true, value: ship }
    : { ok: false, issue: { code: "INVALID_VALUE", path: "ship.required" } };
}

function normalizeShips(value: unknown): Record<string, ShipState> {
'''
)

# 2) Ship metadata migration surface.
replace_once(
    "src/storage/migrations.ts",
    '''  BarrierState,
  SceneState,
  ValidationResult
''',
    '''  BarrierState,
  SceneState,
  ShipState,
  ValidationResult
'''
)
replace_once(
    "src/storage/migrations.ts",
    '''  normalizeArmyState,
  normalizeBarrierState,
  normalizeSceneState
''',
    '''  normalizeArmyState,
  normalizeBarrierState,
  normalizeSceneState,
  normalizeShipState
'''
)
replace_once(
    "src/storage/migrations.ts",
    '''export function migrateBarrierState(raw: unknown): ValidationResult<BarrierState> {
''',
    '''export function migrateShipState(raw: unknown): ValidationResult<ShipState> {
  const version = versionOf(raw);
  if (version !== undefined && version > 1) {
    return { ok: false, issue: { code: "FUTURE_VERSION", version } };
  }
  return normalizeShipState(raw);
}

export function migrateBarrierState(raw: unknown): ValidationResult<BarrierState> {
'''
)

# 3) Metadata repository methods.
replace_once(
    "src/storage/metadataRepository.ts",
    '''  SceneItemRecord,
  SceneState,
  ValidationResult
''',
    '''  SceneItemRecord,
  SceneState,
  ShipState,
  ValidationResult
'''
)
replace_once(
    "src/storage/metadataRepository.ts",
    '''import { migrateArmyState, migrateBarrierState, migrateSceneState } from "./migrations";
''',
    '''import { migrateArmyState, migrateBarrierState, migrateSceneState, migrateShipState } from "./migrations";
'''
)
replace_once(
    "src/storage/metadataRepository.ts",
    '''export interface BarrierRecord {
  item: SceneItemRecord;
  state: BarrierState;
}
''',
    '''export interface ShipRecord {
  item: SceneItemRecord;
  state: ShipState;
}

export interface BarrierRecord {
  item: SceneItemRecord;
  state: BarrierState;
}
'''
)
replace_once(
    "src/storage/metadataRepository.ts",
    '''  async readBarriers(): Promise<BarrierRecord[]> {
''',
    '''  async readShips(): Promise<ShipRecord[]> {
    const items = await this.port.getSceneItems();
    const records: ShipRecord[] = [];
    for (const item of items) {
      const raw = item.metadata[METADATA_KEYS.ship];
      if (raw === undefined) continue;
      const result = migrateShipState(raw);
      if (result.ok) records.push({ item, state: result.value });
    }
    return records;
  }

  async writeShip(itemId: string, state: ShipState, expectedRevision: number): Promise<void> {
    const item = await this.findItem(itemId);
    const raw = item.metadata[METADATA_KEYS.ship];
    const actualRevision =
      raw === undefined ? 0 : requireValid(migrateShipState(raw), METADATA_KEYS.ship).revision;
    assertRevision(actualRevision, expectedRevision);
    if (this.port.patchSceneItemMetadata) {
      await this.port.patchSceneItemMetadata(
        itemId,
        METADATA_KEYS.ship,
        state,
        {},
        raw === undefined ? null : expectedRevision
      );
      return;
    }
    await this.port.updateSceneItem(itemId, {
      metadata: { ...item.metadata, [METADATA_KEYS.ship]: state }
    });
  }

  async clearShip(itemId: string): Promise<void> {
    const item = await this.findItem(itemId);
    if (this.port.patchSceneItemMetadata) {
      const raw = item.metadata[METADATA_KEYS.ship];
      const expectedRevision = raw === undefined
        ? null
        : requireValid(migrateShipState(raw), METADATA_KEYS.ship).revision;
      await this.port.patchSceneItemMetadata(itemId, METADATA_KEYS.ship, undefined, {
        visible: true
      }, expectedRevision);
      return;
    }
    const metadata = Object.fromEntries(
      Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.ship)
    );
    await this.port.updateSceneItem(itemId, { metadata, visible: true });
  }

  async readBarriers(): Promise<BarrierRecord[]> {
'''
)

# 4) Give REGISTER_SHIP the same strategic-grid adapter required by its processor validation.
replace_once(
    "src/background/application.ts",
    '''    if (command.type === "COMPLETE_TURN_NOW") {
''',
    '''    if (command.type === "COMPLETE_TURN_NOW" || command.type === "REGISTER_SHIP") {
'''
)
replace_once(
    "src/background/application.ts",
    '''        // CommandProcessor will reject state-bound turn completion when positions cannot be resolved.
''',
    '''        // CommandProcessor rejects commands that require strategic cells when positions cannot be resolved.
'''
)

# 5) Mirror scene.ships into ship token metadata and hide/restore the shared source.
replace_once(
    "src/background/application.ts",
    '''      const barrierIds = new Set([
''',
    '''      const previousShips = previous.scene.ships ?? {};
      const nextShips = next.scene.ships ?? {};
      const shipIds = new Set([...Object.keys(previousShips), ...Object.keys(nextShips)]);
      for (const shipId of shipIds) {
        const previousState = previousShips[shipId];
        const state = nextShips[shipId];
        if (JSON.stringify(previousState) === JSON.stringify(state)) continue;
        const item = itemById.get(shipId);
        if (!item) continue;
        if (!canCommit()) throw new Error("Coordinator stopped during persistence");
        await this.port.patchSceneItemMetadata(
          shipId,
          METADATA_KEYS.ship,
          state,
          { visible: state === undefined },
          previousState?.revision ?? null
        );
        applied.push({
          itemId: shipId,
          key: METADATA_KEYS.ship,
          previousValue: previousState,
          rollbackUpdate: { visible: item.visible ?? true },
          expectedRevision: state?.revision ?? null
        });
      }
      const barrierIds = new Set([
'''
)
