import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let commitHash = ''
if (process.env.RELEASE_BUILD) {
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {}
}

export default defineConfig({
  plugins: [react()],
  define: {
    __RELEASE_COMMIT__: JSON.stringify(commitHash),
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api/stats': {
        target: process.env.METRICS_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace('/api/stats', '/v1/stats'),
        headers: {
          Authorization: `Bearer ${process.env.METRICS_TOKEN || ''}`,
        },
      },
      '/api/visits': {
        target: process.env.METRICS_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace('/api/visits', '/v1/visits'),
        headers: {
          Authorization: `Bearer ${process.env.METRICS_TOKEN || ''}`,
        },
      },
    },
  },
})
