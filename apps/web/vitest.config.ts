import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "virtual:pwa-register": new URL(
        "./src/test/pwa-register-stub.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
