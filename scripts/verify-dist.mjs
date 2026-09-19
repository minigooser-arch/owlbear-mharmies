import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { HISTORICAL_PAGE_ASSETS } from "./historical-pages-assets.mjs";

const distDir = resolve("dist");
const assetsDir = resolve(distDir, "assets");
const assetNames = new Set(await readdir(assetsDir));
const failures = [];

async function assertFile(relativePath, context) {
  try {
    const info = await stat(resolve(distDir, relativePath));
    if (!info.isFile()) failures.push(`${context}: ${relativePath} is not a file`);
  } catch {
    failures.push(`${context}: missing ${relativePath}`);
  }
}

function distPathFromPublicUrl(value) {
  const prefix = "/owlbear-mharmies/";
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function assetNameFromPublicUrl(value) {
  const prefix = "/owlbear-mharmies/assets/";
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

const indexHtml = await readFile(resolve(distDir, "index.html"), "utf8");
const backgroundHtml = await readFile(resolve(distDir, "background.html"), "utf8");

for (const [htmlName, html] of [
  ["index.html", indexHtml],
  ["background.html", backgroundHtml]
]) {
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  for (const ref of refs) {
    const localPath = distPathFromPublicUrl(ref);
    if (localPath) await assertFile(localPath, `${htmlName} reference`);
  }
}

if (!indexHtml.includes("Загрузка интерфейса…")) {
  failures.push("index.html: inline loading fallback is missing");
}

const manifest = JSON.parse(await readFile(resolve(distDir, "manifest.json"), "utf8"));
for (const [label, value] of [
  ["action.popover", manifest.action?.popover],
  ["background_url", manifest.background_url]
]) {
  if (typeof value !== "string") {
    failures.push(`manifest.json: ${label} is missing`);
    continue;
  }
  const url = new URL(value);
  if (url.origin !== "https://minigooser-arch.github.io") {
    failures.push(`manifest.json: ${label} has unexpected origin ${url.origin}`);
  }
  const localPath = distPathFromPublicUrl(url.pathname);
  if (!localPath) {
    failures.push(`manifest.json: ${label} points outside /owlbear-mharmies/`);
  } else {
    await assertFile(localPath, `manifest.json ${label}`);
  }
  if (!url.searchParams.get("v")) {
    failures.push(`manifest.json: ${label} has no cache-busting v parameter`);
  }
}

for (const names of Object.values(HISTORICAL_PAGE_ASSETS)) {
  for (const name of names) {
    if (!assetNames.has(name)) failures.push(`historical asset alias missing: assets/${name}`);
  }
}

const currentPopoverJs = assetNameFromPublicUrl(
  indexHtml.match(/<script[^>]+src="([^"]*popover-[^"]+\.js)"/)?.[1] ?? ""
);
const currentPopoverCss = assetNameFromPublicUrl(
  indexHtml.match(/<link[^>]+href="([^"]*popover-[^"]+\.css)"/)?.[1] ?? ""
);
const currentBackgroundJs = assetNameFromPublicUrl(
  backgroundHtml.match(/<script[^>]+src="([^"]*background-[^"]+\.js)"/)?.[1] ?? ""
);
const currentTurnScheduleJs = assetNameFromPublicUrl(
  indexHtml.match(/href="([^"]*turnSchedule-[^"]+\.js)"/)?.[1] ?? ""
);
const currentLocalCloneJs = assetNameFromPublicUrl(
  backgroundHtml.match(/href="([^"]*localCloneReconciler-[^"]+\.js)"/)?.[1] ?? ""
);

let currentSdkAdapterJs = null;
if (currentPopoverJs) {
  const popoverSource = await readFile(resolve(assetsDir, currentPopoverJs), "utf8");
  currentSdkAdapterJs = popoverSource.match(/assets\/(sdkAdapter-[A-Za-z0-9_.-]+\.js)/)?.[1] ?? null;
}

const currentByKind = {
  popoverJs: currentPopoverJs,
  popoverCss: currentPopoverCss,
  backgroundJs: currentBackgroundJs,
  sdkAdapterJs: currentSdkAdapterJs,
  turnScheduleJs: currentTurnScheduleJs,
  localCloneJs: currentLocalCloneJs
};

for (const [kind, names] of Object.entries(HISTORICAL_PAGE_ASSETS)) {
  if (kind === "preloadHelperJs") continue;
  const currentName = currentByKind[kind];
  if (!currentName || !assetNames.has(currentName)) {
    failures.push(`could not identify current asset for ${kind}`);
    continue;
  }
  const expected = await readFile(resolve(assetsDir, currentName));
  for (const name of names) {
    if (!assetNames.has(name)) continue;
    const actual = await readFile(resolve(assetsDir, name));
    if (!actual.equals(expected)) {
      failures.push(`historical alias assets/${name} does not match current ${kind} asset ${currentName}`);
    }
  }
}

for (const name of assetNames) {
  if (!name.endsWith(".js")) continue;
  const source = await readFile(resolve(assetsDir, name), "utf8");
  const referencedAssets = new Set();
  for (const match of source.matchAll(/["'`](?:\.\/|assets\/)([A-Za-z0-9_.-]+\.js)["'`]/g)) {
    referencedAssets.add(match[1]);
  }
  for (const dependency of referencedAssets) {
    if (!assetNames.has(dependency)) {
      failures.push(`assets/${name}: references missing assets/${dependency}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Production artifact verification failed:\n- ${failures.join("\n- ")}`);
}

process.stdout.write(
  `Verified production artifact: ${assetNames.size} assets, all HTML/module references resolve, ` +
  `${Object.values(HISTORICAL_PAGE_ASSETS).flat().length} historical aliases present and byte-identical to current assets.\n`
);
