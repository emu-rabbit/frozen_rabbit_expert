import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/evaluate-generic-pathwise-headroom/*.test.ts'],
  },
})
