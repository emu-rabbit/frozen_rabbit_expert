import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    exclude: ['packages/solver/benchmarks/**'],
    coverage: {
      provider: 'v8',
    },
  },
})
