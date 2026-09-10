import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sources = [
  "routeToolIntegration.ts",
  "shipRouteToolIntegration.ts",
  "transportLandingTool.ts",
  "mapBrushTool.ts",
  "navalBattleAreaTool.ts"
];

describe("programmatic Letopis tools", () => {
  it.each(sources)("hides %s from the Owlbear right toolbar", (file) => {
    const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    expect(source).toContain("PROGRAMMATIC_ONLY_TOOL_FILTER");
  });
});
