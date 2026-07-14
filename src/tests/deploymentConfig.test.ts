import { expect, it } from "vitest";
import { loadConfigFromFile } from "vite";
import manifest from "../../public/manifest.json";

it("targets the owlbear-mharmies GitHub Pages project path", async () => {
  const loadedConfig = await loadConfigFromFile({
    command: "build",
    mode: "production"
  });

  expect(loadedConfig?.config.base).toBe("/owlbear-mharmies/");
  expect(manifest.action.popover).toBe(
    "https://minigooser-arch.github.io/owlbear-mharmies/index.html"
  );
  expect(manifest.background_url).toBe(
    "https://minigooser-arch.github.io/owlbear-mharmies/background.html"
  );
});
