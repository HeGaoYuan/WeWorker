import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 20000,
    // Tests never launch WeWorker 浏览器 unless a test opts in explicitly.
    env: { WEWORKER_BROWSER_MODE: 'system' },
    // Pinned upstream tests use their own module aliases and dedicated config.
    exclude: [...configDefaults.exclude, 'scripts/opencli-xiaohongshu/upstream/**', 'scripts/opencli-wave4/upstream/**'],
  },
})
