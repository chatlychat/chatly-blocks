import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const vitestExecution = { pool: 'threads' as const };

export default defineConfig({
  resolve: {
    alias: {
      // Spec-only: the parity spec compares against the owner's schema.
      '@livechat/shared/widget-blocks': fileURLToPath(
        new URL('../shared/src/widget-blocks/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    ...vitestExecution,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
