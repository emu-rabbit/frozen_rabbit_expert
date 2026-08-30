import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/data/tests/**/*.test.ts',
      'packages/domain/tests/**/*.test.ts',
      'packages/protocol/tests/**/*.test.ts',
      'packages/simulator/tests/**/*.test.ts',
      'tests/golden-traces/**/*.test.ts',
      'tests/activeCraftSession.test.ts',
      'tests/webPlannerWasm.test.ts',
    ],
    coverage: {
      provider: 'v8',
    },
  },
})
