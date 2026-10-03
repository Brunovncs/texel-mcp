import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Bundles spawned by tests must not ask the production site for a newer release.
    env: { TEXEL_NO_UPDATE_CHECK: '1' },
  },
});
