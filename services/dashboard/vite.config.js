import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Local `npm run dev` uses the same path the nginx image proxies in-cluster.
    proxy: {
      '/api/orchestrator': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/orchestrator/, ''),
      },
    },
  },
})
