import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
import {execSync} from 'node:child_process'

// The commit this build was made from, for the admin panel's "which build is
// live" line. Empty when git isn't there to ask (a build from an archive).
function git(args) {
  try { return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
}


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(git('rev-parse HEAD')),
    __BUILD_TIME__: JSON.stringify(git('log -1 --format=%cI')),
  },
  resolve: {
    alias: [{ find: "@", replacement: resolve(__dirname, "./src") }]
  },
  // `npm run preview` serves the production build the way nginx does in
  // production: same origin, with /api and /uploads passed to the backend.
  // API_PORT says where the backend is when it isn't on 8080 (tools/run-local.sh).
  preview: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.API_PORT || 8080}`,
      '/uploads': `http://127.0.0.1:${process.env.API_PORT || 8080}`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
