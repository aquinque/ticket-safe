import { defineConfig } from "vitest/config";
import path from "path";

// Pin the timezone so date-based tests (dateFilters) are deterministic on any
// machine. The date helpers compare against the *local* calendar day on
// purpose (a "tonight" filter should mean the user's tonight), so without a
// fixed TZ the tests pass in UTC/CI but fail in e.g. Europe/Paris. Set here,
// before test workers spawn, so they inherit TZ=UTC at startup.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
