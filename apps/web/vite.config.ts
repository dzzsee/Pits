import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Pits',
        short_name: 'Pits',
        description: 'Estado de tu reparacion y fidelizacion del taller',
        lang: 'es',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Sin `html`: el index no se precachea a proposito. Precachearlo
        // ata la app al HTML del despliegue anterior hasta que el service
        // worker se actualiza, asi que un F5 seguiria mostrando la version
        // anterior. Las navegaciones las resuelve `NetworkFirst` en `sw.ts`.
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    // Marca de build, para saber desde la consola que bundle esta cargado.
    'import.meta.env.VITE_BUILD': JSON.stringify(
      process.env.PITS_BUILD ??
        // Sin variable de entorno: el hash lo genera el propio nombre del
        // fichero, asi que basta con la fecha del build.
        new Date().toISOString().slice(0, 16).replace('T', ' '),
    ),
  },
})
