// Temporary: serves this branch's build against the branch's server on 8081.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  preview: { port: 5175, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8081', '/uploads': 'http://127.0.0.1:8081' } },
})
