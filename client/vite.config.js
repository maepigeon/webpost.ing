import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
