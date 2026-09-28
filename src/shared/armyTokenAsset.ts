import type { ArmyTokenAsset, Vector2 } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function vector(value: unknown, positive = false): Vector2 | undefined {
  if (!isRecord(value) || typeof value.x !== "number" || !Number.isFinite(value.x) || typeof value.y !== "number" || !Number.isFinite(value.y)) return undefined;
  if (positive && (value.x <= 0 || value.y <= 0)) return undefined;
  return { x: value.x, y: value.y };
}

export function parseArmyTokenAsset(value: unknown): ArmyTokenAsset | undefined {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.trim().length === 0 || !isRecord(value.image) ||
      typeof value.image.width !== "number" || value.image.width <= 0 || typeof value.image.height !== "number" || value.image.height <= 0 ||
      typeof value.image.mime !== "string" || value.image.mime.trim().length === 0 || typeof value.image.url !== "string" || value.image.url.trim().length === 0 ||
      !isRecord(value.grid) || typeof value.grid.dpi !== "number" || value.grid.dpi <= 0) return undefined;
  const offset = vector(value.grid.offset);
  if (!offset) return undefined;
  const scale = value.scale === undefined ? undefined : vector(value.scale, true);
  if (value.scale !== undefined && !scale) return undefined;
  if (value.rotation !== undefined && (typeof value.rotation !== "number" || !Number.isFinite(value.rotation))) return undefined;
  if (value.description !== undefined && typeof value.description !== "string") return undefined;
  return {
    name: value.name.trim(),
    image: { width: value.image.width, height: value.image.height, mime: value.image.mime, url: value.image.url },
    grid: { dpi: value.grid.dpi, offset },
    ...(scale ? { scale } : {}),
    ...(value.rotation !== undefined ? { rotation: value.rotation } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {})
  };
}
