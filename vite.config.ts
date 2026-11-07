/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        // Model files are NOT precached; ModelManager stores them in Cache Storage on demand.
        navigateFallback: '/index.html',
        // ONNX runtime files copied to /ort by scripts/copy-ort-wasm.mjs are large:
        // cache them at runtime (first use) instead of precaching.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/ort/') || url.pathname.startsWith('/worklets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ort-runtime', expiration: { maxEntries: 30 } },
          },
        ],
      },
      manifest: {
        name: 'Voice Dzikir',
        short_name: 'Voice Dzikir',
        description: 'Just recite your dhikr. Let your voice count every repetition.',
        theme_color: '#0f3d2e',
        background_color: '#0f3d2e',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
