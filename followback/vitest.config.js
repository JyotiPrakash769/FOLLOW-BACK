import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ is Playwright's; it has its own runner (npm run test:e2e).
    include: ["tests/**/*.test.js"],
    environment: "node"
  }
});
