import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig({
  root: fileURLToPath(new URL('./standalone', import.meta.url)),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  build: { outDir: '../dist-vps', emptyOutDir: true, sourcemap: false },
});
