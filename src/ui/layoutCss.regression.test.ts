import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

function css(path: string): string {
  return readFileSync(resolve(path), "utf8").replace(/\s+/g, " ");
}

it("keeps the popover on a fixed viewport and makes the content area vertically scrollable", () => {
  const app = css("src/ui/app.css");
  const wiki = css("src/ui/wiki-light.css");

  expect(app).toContain("html, body, #root { width: 100%; height: 100%; min-height: 0; overflow: hidden; }");
  expect(app).toContain(".app-shell { height: 100dvh; min-height: 0; overflow: hidden;");
  expect(app).toContain("overflow-y:auto");
  expect(wiki).toContain("height: 100dvh");
  expect(wiki).toContain("overflow-y: auto");
});

it("wraps management subtabs so hidden sections do not require horizontal scrolling", () => {
  const app = css("src/ui/app.css");
  const wiki = css("src/ui/wiki-light.css");

  expect(app).toContain(".subtabs { display:flex; flex-wrap:wrap;");
  expect(wiki).toContain(".subtabs { display: flex; flex-wrap: wrap;");
  expect(wiki).toContain("overflow: visible");
});
