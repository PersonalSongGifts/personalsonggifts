import { defineConfig } from "vitest/config";

// Isolated config for the inert staging drafts. The app's own vitest config
// only includes src/**, so these tests never run as part of the app suite.
export default defineConfig({
  test: {
    environment: "node",
    include: ["docs/checkout-staging/tests/**/*.test.ts"],
  },
});
