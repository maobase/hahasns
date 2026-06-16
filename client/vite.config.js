import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Tailwind v4 is wired through its first-party Vite plugin (CSS-first, no
  // tailwind.config.cjs / postcss.config.cjs). HeroUI v3 ships its own styles
  // via `@import "@heroui/styles"` in src/styles/tailwind.css.
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
