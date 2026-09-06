import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve(process.argv[2] ?? "dist/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const deploymentSha = process.env.GITHUB_SHA?.trim();
const cacheToken = deploymentSha && deploymentSha.length > 0
  ? deploymentSha.slice(0, 12)
  : String(manifest.version);

function withCacheToken(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("v", cacheToken);
  return parsed.toString();
}

manifest.action.popover = withCacheToken(manifest.action.popover);
manifest.background_url = withCacheToken(manifest.background_url);

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
