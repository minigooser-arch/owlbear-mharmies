import { parseCellKey } from "../grid/strategicGrid";
import { METADATA_KEYS } from "../shared/constants";
import type { GridCellCoord } from "../shared/types";
import type { DesiredLocalOverlay } from "../owlbear/localOverlayReconciler";

export interface GridCellBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FogObserver {
  cell: GridCellCoord;
  rangeCells: number;
}

export interface FogOfWarOverlaySource {
  dpi: number;
  bounds: GridCellBounds;
  observers: readonly FogObserver[];
}

export function deriveGridBounds(
  cells: Readonly<Record<string, unknown>>
): GridCellBounds | undefined {
  let bounds: GridCellBounds | undefined;
  for (const rawKey of Object.keys(cells)) {
    let cell: GridCellCoord;
    try {
      cell = parseCellKey(rawKey);
    } catch {
      continue;
    }
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, cell.x),
          maxX: Math.max(bounds.maxX, cell.x),
          minY: Math.min(bounds.minY, cell.y),
          maxY: Math.max(bounds.maxY, cell.y)
        }
      : { minX: cell.x, maxX: cell.x, minY: cell.y, maxY: cell.y };
  }
  return bounds;
}

export const FOG_OF_WAR_OVERLAY_VERSION = "FOG_OF_WAR_V3";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = concatBytes(typeBytes, data);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(body, 4);
  writeUint32(chunk, 8 + data.length, crc32(body));
  return chunk;
}

/**
 * A single raster overlay avoids per-rectangle curve outlines. Each pixel is
 * one strategic cell; revealed cells are transparent and fogged cells are a
 * neutral gray with low opacity, so the underlying map remains readable.
 */
function pngDataUrl(source: FogOfWarOverlaySource): string {
  const width = source.bounds.maxX - source.bounds.minX + 1;
  const height = source.bounds.maxY - source.bounds.minY + 1;
  const raw = new Uint8Array(height * (1 + width * 4));
  // Strong enough to neutralize coloured map/border overlays, while still
  // leaving the underlying terrain readable through the fog.
  const alpha = Math.round(0.55 * 255);
  const observers = source.observers.filter((observer) =>
    Number.isFinite(observer.rangeCells) && observer.rangeCells >= 0
  );
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[rawOffset++] = 0;
    for (let x = 0; x < width; x += 1) {
      const cellX = source.bounds.minX + x;
      const cellY = source.bounds.minY + y;
      const revealed = observers.some((observer) => {
        const dx = cellX - observer.cell.x;
        const dy = cellY - observer.cell.y;
        const radius = observer.rangeCells + 0.5;
        return dx * dx + dy * dy <= radius * radius;
      });
      raw[rawOffset++] = 0x80;
      raw[rawOffset++] = 0x80;
      raw[rawOffset++] = 0x80;
      raw[rawOffset++] = revealed ? 0 : alpha;
    }
  }

  const deflateBlocks: Uint8Array[] = [];
  for (let offset = 0; offset < raw.length;) {
    const length = Math.min(65_535, raw.length - offset);
    const block = new Uint8Array(5 + length);
    block[0] = offset + length >= raw.length ? 1 : 0;
    block[1] = length & 0xff;
    block[2] = (length >>> 8) & 0xff;
    const complement = (~length) & 0xffff;
    block[3] = complement & 0xff;
    block[4] = (complement >>> 8) & 0xff;
    block.set(raw.subarray(offset, offset + length), 5);
    deflateBlocks.push(block);
    offset += length;
  }
  const zlib = concatBytes(new Uint8Array([0x78, 0x01]), ...deflateBlocks);
  const checksum = new Uint8Array(4);
  writeUint32(checksum, 0, adler32(raw));
  const idat = concatBytes(zlib, checksum);
  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header[8] = 8;
  header[9] = 6;
  const png = concatBytes(
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array())
  );
  let binary = "";
  for (let offset = 0; offset < png.length; offset += 0x8000) {
    binary += String.fromCharCode(...png.subarray(offset, offset + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

export function buildFogOfWarOverlays(source: FogOfWarOverlaySource): DesiredLocalOverlay[] {
  const width = source.bounds.maxX - source.bounds.minX + 1;
  const height = source.bounds.maxY - source.bounds.minY + 1;
  const key = FOG_OF_WAR_OVERLAY_VERSION;
  return [{
    key,
    item: {
      type: "IMAGE",
      name: "Туман войны",
      position: {
        x: (source.bounds.minX + source.bounds.maxX + 1) * source.dpi / 2,
        y: (source.bounds.minY + source.bounds.maxY + 1) * source.dpi / 2
      },
      rotation: 0,
      scale: { x: 1, y: 1 },
      layer: "FOG",
      zIndex: 0,
      visible: true,
      locked: true,
      disableHit: true,
      disableAutoZIndex: true,
      image: { width, height, mime: "image/png", url: pngDataUrl(source) },
      grid: { dpi: 1, offset: { x: 0, y: 0 } },
      metadata: {
        [METADATA_KEYS.mapOverlay]: { key, kind: "FOG_OF_WAR" }
      }
    }
  }];
}
