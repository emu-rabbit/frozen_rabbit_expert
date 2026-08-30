import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tools/evaluate-generic-capability-bounds/matrix.test.ts',
      'tools/evaluate-generic-cosmic-families/matrix.test.ts',
      'tools/evaluate-generic-pathwise-headroom/probe.test.ts',
    ],
  },
})
