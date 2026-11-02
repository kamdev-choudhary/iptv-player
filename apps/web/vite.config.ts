import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@tuner/shared` and `@tuner/ui` resolve through the pnpm workspace link
    // and their own exports maps. Aliasing them here would also swallow their
    // subpath imports, such as `@tuner/ui/tokens.css`.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The API, the stream proxy and the admin surface are all same-origin in
    // production, so they are same-origin in development too. That keeps CORS
    // and the proxy's own URL rewriting out of the difference between the two.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/stream': { target: 'http://localhost:8080', changeOrigin: true },
      '/admin': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // hls.js is a third of the bundle and useless until someone presses play.
        manualChunks: (id) => (id.includes('hls.js') ? 'hls' : undefined),
      },
    },
  },
})
