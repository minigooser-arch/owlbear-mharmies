import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/owlbear-mharmies/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popover: resolve(rootDir, "index.html"),
        background: resolve(rootDir, "background.html")
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/tests/setup.ts"]
  }
});
