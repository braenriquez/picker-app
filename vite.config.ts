import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      scope: '/picker-app/',
      base: '/picker-app/',
      manifest: {
        name: 'Gruppo Bravo',
        short_name: 'Gruppo Bravo',
        description: 'Inventory picking app for Gruppo Bravo',
        theme_color: '#c2410c',
        background_color: '#fafaf9',
        display: 'standalone',
        start_url: '/picker-app/',
        scope: '/picker-app/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        navigateFallback: '/picker-app/',
        navigateFallbackDenylist: [/^\/api/]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
