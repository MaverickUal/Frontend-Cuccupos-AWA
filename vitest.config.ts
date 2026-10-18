import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // Pin the timezone so date assertions are deterministic wherever they run.
    // A second pass under a DST zone is added in scripts below.
    env: { TZ: "UTC" },
  },
})