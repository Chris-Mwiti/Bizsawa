import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'e2e/api/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'sync/**/__tests__/**/*.test.ts',
      'hooks/**/__tests__/**/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['verbose'],
  },
})
