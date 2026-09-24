import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROGRAMMATIC_ONLY_TOOL_FILTER } from "../shared/constants";

const sources = [
  "shipRouteToolIntegration.ts",
  "transportLandingTool.ts",
  "navalBattleAreaTool.ts"
];

describe("programmatic Letopis tools", () => {
  it.each(sources)("hides %s from the Owlbear right toolbar", (file) => {
    const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    expect(source).toContain("PROGRAMMATIC_ONLY_TOOL_FILTER");
  });

  it("uses an unreachable sentinel tool id for the hidden toolbar filter", () => {
    expect(PROGRAMMATIC_ONLY_TOOL_FILTER.activeTools).toEqual([
      "com.letopis.army-control/__programmatic-only__"
    ]);
  });
});

it("keeps the map brush as a real GM-visible Owlbear tool with a default mode", () => {
  const source = readFileSync(fileURLToPath(new URL("./mapBrushTool.ts", import.meta.url)), "utf8");
  expect(source).not.toContain("PROGRAMMATIC_ONLY_TOOL_FILTER");
  expect(source).toContain('filter: { roles: ["GM"] }');
  expect(source).toContain("defaultMode: MAP_BRUSH_TOOL_MODE_ID");
});
