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
      },
      output: {
        // Keep turn scheduling as a shared chunk for both pages. Historical
        // deployed HTML references this chunk by hash, so the compatibility
        // alias builder must always have a real implementation to copy.
        manualChunks: {
          turnSchedule: [resolve(rootDir, "src/turns/turnSchedule.ts")]
        }
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/tests/setup.ts"]
  }
});
