import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['desk.operixsuite.com'],
    proxy: process.env.VITE_API_URL
      ? undefined
      : {
          '/api': {
            target: 'http://localhost:8002',
            changeOrigin: true,
          },
        },
  },
})
