import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const distDir = resolve("dist");
const indexHtml = await readFile(resolve(distDir, "index.html"), "utf8");
const entryMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="\/owlbear-mharmies\/([^"]+\.js)"/);
if (!entryMatch) throw new Error("Could not locate built popover module in dist/index.html");

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"><main>HTML fallback</main></div></body></html>',
  {
    url: "https://minigooser-arch.github.io/owlbear-mharmies/index.html",
    pretendToBeVisual: true
  }
);

const globals = [
  "window",
  "document",
  "navigator",
  "MutationObserver",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MessageEvent",
  "localStorage"
];
for (const key of globals) {
  globalThis[key] = dom.window[key];
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);

const entryUrl = pathToFileURL(resolve(distDir, entryMatch[1])).href;
await import(`${entryUrl}?dist-smoke=${Date.now()}`);

await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));

const root = document.getElementById("root");
const text = root?.textContent ?? "";
if (!text.includes("Загрузка")) {
  throw new Error(`Built popover entry did not render its loading UI. Root text: ${JSON.stringify(text)}`);
}

process.stdout.write(`Built popover smoke test passed: ${entryMatch[1]} rendered ${JSON.stringify(text)}.\n`);
dom.window.close();
