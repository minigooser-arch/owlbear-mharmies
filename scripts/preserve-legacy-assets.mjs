import { copyFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { HISTORICAL_PAGE_ASSETS } from "./historical-pages-assets.mjs";

const assetsDir = resolve("dist/assets");
const files = await readdir(assetsDir);

function requireAsset(pattern, label) {
  const match = files.find((name) => pattern.test(name));
  if (!match) throw new Error(`Missing built ${label} asset`);
  return match;
}

const current = {
  popoverJs: requireAsset(/^popover-.*\.js$/, "popover JS"),
  popoverCss: requireAsset(/^popover-.*\.css$/, "popover CSS"),
  backgroundJs: requireAsset(/^background-.*\.js$/, "background JS"),
  sdkAdapterJs: requireAsset(/^sdkAdapter-.*\.js$/, "SDK adapter JS"),
  turnScheduleJs: requireAsset(/^turnSchedule-.*\.js$/, "turn schedule JS"),
  localCloneJs: requireAsset(/^localCloneReconciler-.*\.js$/, "local clone reconciler JS")
};

for (const [kind, names] of Object.entries(HISTORICAL_PAGE_ASSETS)) {
  if (kind === "preloadHelperJs") continue;
  const source = current[kind];
  if (!source) throw new Error(`No current asset source configured for ${kind}`);
  for (const name of names) {
    if (name === source) continue;
    await copyFile(resolve(assetsDir, source), resolve(assetsDir, name));
  }
}

// Early Vite builds emitted a standalone preload helper. Old HTML can still try to preload it.
// A harmless compatibility module prevents that request from becoming a 404.
const preloadCompat = [
  "const preload = (baseModule) => baseModule();",
  "export { preload as _, preload as __vitePreload };",
  ""
].join("\n");
for (const name of HISTORICAL_PAGE_ASSETS.preloadHelperJs) {
  await writeFile(resolve(assetsDir, name), preloadCompat, "utf8");
}
