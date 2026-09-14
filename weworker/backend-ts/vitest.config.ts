import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __BUILD_DEFAULT_PROVIDER__: JSON.stringify('anthropic'),
  },
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    forks: {
      execArgv: ['--experimental-sqlite'],
    },
  },
})
