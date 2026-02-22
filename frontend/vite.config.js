import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        // Long timeout: audio extract = transcribe + Gemini (can take 1–2 min)
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setTimeout(120000) // 2 min
          })
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.setTimeout(120000)
          })
          proxy.on('error', (err, _req, _res) => {
            console.warn('[vite proxy]', err?.message || err, '— is Django running on 127.0.0.1:8000?')
          })
        },
      },
    },
  },
})
