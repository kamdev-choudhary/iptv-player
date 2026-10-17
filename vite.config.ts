import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Relative asset URLs, so the build works from a repo subpath on GitHub
  // Pages as well as from a domain root, with no base to keep in sync.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // hls.js is a third of the bundle and only needed once playback starts.
        manualChunks: (id) => (id.includes('node_modules/hls.js') ? 'hls' : undefined),
      },
    },
  },
})
