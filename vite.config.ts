import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves project sites from /<repo>/. Set BASE_PATH in the
// deploy workflow; local dev and Vercel/Netlify use "/".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.BASE_PATH || '/',
  build: { target: 'es2020' },
});
