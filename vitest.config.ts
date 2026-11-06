import { defineConfig } from "vitest/config";

// App tests only. Each Function has its own vitest run inside extensions/<name>.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
