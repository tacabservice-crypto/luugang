import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.svg', 'dice.mp3', 'win.mp3'],
        manifest: {
          name: 'Ludo$om',
          short_name: 'Ludo$om',
          description:
            'A modern online Ludo game with real-time multiplayer and betting features.',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
            },
            {
              src: 'logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'build',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          agent: path.resolve(__dirname, 'agent.html'),
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              clientPort: 3000,
            },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              // Watch for file changes and trigger HMR.
              // Explicitly ignore the JSON database file to prevent Vite from
              // triggering a full-page reload every time the server writes to it.
              ignored: ['**/db_store.json'],
            },
    },
  };
});
