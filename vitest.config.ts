import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // Le smoke-engine ouvre jusqu'à 200 boosters + fixtures : timeouts généreux.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
