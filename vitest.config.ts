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
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['packages/solver/benchmarks/**'],
    coverage: {
      provider: 'v8',
    },
  },
})
