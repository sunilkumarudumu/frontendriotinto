import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET =
  process.env.VITE_DEV_API_PROXY_TARGET ||
  'https://app-mine-cls-dev-agffcjfgd5eqfcdh.centralindia-01.azurewebsites.net'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ['**/.tmp-chrome/**'],
    },
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
