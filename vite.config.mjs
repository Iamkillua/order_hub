import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://*.googleusercontent.com; connect-src 'self'; font-src 'self' data:";

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'order-hub-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
