import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  type Dirent
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { loadConfigFromFile } from "vite";
import packageLock from "../../package-lock.json";
import packageJson from "../../package.json";
import manifest from "../../public/manifest.json";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const iconPath = new URL("../../public/icon-1.2.png", import.meta.url);
const coverPath = new URL("../../public/cover.png", import.meta.url);
const strayRootImagePath = new URL("../../icon-1.2.png", import.meta.url);

interface DecodedRgbaPng {
  width: number;
  height: number;
  pixels: Buffer;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(png: Buffer): DecodedRgbaPng {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  expect(png[28]).toBe(0);

  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idatChunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }

  const filtered = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    if (filter === undefined || filter > 4) throw new Error(`Unsupported PNG filter: ${filter}`);
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[sourceOffset + x] ?? 0;
      const left = x >= bytesPerPixel ? pixels[y * rowBytes + x - bytesPerPixel] ?? 0 : 0;
      const up = y > 0 ? pixels[(y - 1) * rowBytes + x] ?? 0 : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[(y - 1) * rowBytes + x - bytesPerPixel] ?? 0
        : 0;
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? paeth(left, up, upperLeft)
                : 0;
      pixels[y * rowBytes + x] = (raw + predictor) & 0xff;
    }
    sourceOffset += rowBytes;
  }
  return { width, height, pixels };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry: Dirent) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:css|html|json|ts|tsx)$/.test(entry.name) && !/\.test\.[^.]+$/.test(entry.name)
      ? [path]
      : [];
  });
}

it("keeps the source manifest and package versions aligned without hard-coding a release number", async () => {
  const loadedConfig = await loadConfigFromFile({
    command: "build",
    mode: "production"
  });

  expect(loadedConfig?.config.base).toBe("/owlbear-mharmies/");
  expect(manifest.manifest_version).toBe(1);
  expect(manifest.version).toBe(packageJson.version);
  expect(packageLock.version).toBe(packageJson.version);
  expect(packageLock.packages[""].version).toBe(packageJson.version);
  expect(manifest.icon).toMatch(/icon-1\.2\.png$/);
  expect(manifest.action.icon).toMatch(/icon-1\.2\.png$/);
  expect(new URL(manifest.action.popover).searchParams.get("v")).toBe(packageJson.version);
  expect(new URL(manifest.background_url).searchParams.get("v")).toBe(packageJson.version);
  expect(packageJson.scripts.build).toContain("stamp-manifest.mjs");
});

it("stamps built entrypoints with a deployment-specific GitHub SHA", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "letopis-manifest-"));
  const manifestPath = join(temporaryDirectory, "manifest.json");
  const deploymentSha = "0123456789abcdef0123456789abcdef01234567";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  try {
    execFileSync(
      process.execPath,
      [join(rootDir, "scripts", "stamp-manifest.mjs"), manifestPath],
      {
        cwd: rootDir,
        env: { ...process.env, GITHUB_SHA: deploymentSha },
        stdio: "pipe"
      }
    );
    const stamped = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
    const expectedToken = deploymentSha.slice(0, 12);

    expect(stamped.version).toBe(manifest.version);
    expect(new URL(stamped.action.popover).searchParams.get("v")).toBe(expectedToken);
    expect(new URL(stamped.background_url).searchParams.get("v")).toBe(expectedToken);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

it("ships a square RGBA sword icon with transparent corners", () => {
  const image = decodeRgbaPng(readFileSync(iconPath));
  expect(image.width).toBe(image.height);
  expect(image.width).toBeGreaterThanOrEqual(64);
  const alphaAt = (x: number, y: number) => image.pixels[(y * image.width + x) * 4 + 3];
  expect([
    alphaAt(0, 0),
    alphaAt(image.width - 1, 0),
    alphaAt(0, image.height - 1),
    alphaAt(image.width - 1, image.height - 1)
  ]).toEqual([0, 0, 0, 0]);
});

it("publishes the extension hero image from public instead of leaving it at repository root", () => {
  expect(existsSync(coverPath)).toBe(true);
  expect(existsSync(strayRootImagePath)).toBe(false);
  const png = readFileSync(coverPath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBeGreaterThan(0);
  expect(png.readUInt32BE(20)).toBeGreaterThan(0);
});

it("retires the unversioned SVG from production", () => {
  expect(existsSync(new URL("../../public/icon.svg", import.meta.url))).toBe(false);
  const productionFiles = [
    ...sourceFiles(fileURLToPath(new URL("../../src", import.meta.url))),
    fileURLToPath(new URL("../../public/manifest.json", import.meta.url))
  ];
  const references = productionFiles.filter((path) => readFileSync(path, "utf8").includes("icon.svg"));
  expect(references).toEqual([]);
});
