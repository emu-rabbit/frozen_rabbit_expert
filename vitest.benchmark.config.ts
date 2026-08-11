import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/solver/benchmarks/**/*.test.ts'],
    fileParallelism: false,
  },
})
