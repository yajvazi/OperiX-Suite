import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Docker build args are present in process.env while local .env files are
  // loaded by Vite. Keep both sources, with explicit process values winning.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const apiUrl = env.VITE_API_URL
  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY

  if (mode === 'production' && (!supabaseUrl || !supabasePublishableKey)) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY for the Desk production build.',
    )
  }

  return {
    base: './',
    plugins: [react()],
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['desk.operixsuite.com'],
      proxy: apiUrl
        ? undefined
        : {
            '/api': {
              target: 'http://localhost:8002',
              changeOrigin: true,
            },
          },
    },
  }
})
