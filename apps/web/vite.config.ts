import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Installable, because this is watched on a phone.
 *
 * What is precached is the shell and nothing else. The catalog is live data
 * and belongs to TanStack Query; video must never go near a cache, which is
 * why `/stream` is on the denylist rather than merely absent — without it the
 * navigation fallback would answer a segment request with `index.html`.
 */
const pwa = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'Tuner',
    short_name: 'Tuner',
    description: 'A self-hosted IPTV player that shows which streams actually work.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b0d11',
    theme_color: '#16191d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/stream\//, /^\/admin\//, /^\/health$/],
    // A served segment is megabytes and single-use; nothing about it should
    // ever be held by a service worker.
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: {
          cacheName: 'fonts',
          expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
  // A service worker in development would sit between Vite's own reloads and
  // the browser, and between the e2e run and the API.
  devOptions: { enabled: false },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), pwa],
  resolve: {
    // `@tuner/shared` and `@tuner/ui` resolve through the pnpm workspace link
    // and their own exports maps. Aliasing them here would also swallow their
    // subpath imports, such as `@tuner/ui/tokens.css`.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 12995,
    // The API, the stream proxy and the admin surface are all same-origin in
    // production, so they are same-origin in development too. That keeps CORS
    // and the proxy's own URL rewriting out of the difference between the two.
    proxy: {
      '/api': { target: 'http://127.0.0.1:12994', changeOrigin: true },
      '/stream': { target: 'http://127.0.0.1:12994', changeOrigin: true },
      '/admin': { target: 'http://127.0.0.1:12994', changeOrigin: true },
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
