import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  // Same-origin proxy so the browser can call HA's REST API (history) without CORS.
  const haProxy = {
    target: env.VITE_HA_URL ?? 'http://192.168.66.20:8123',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ha-api/, ''),
  }
  return {
    plugins: [react()],
    server: { proxy: { '/ha-api': haProxy } },
    preview: { proxy: { '/ha-api': haProxy } },
  }
})
