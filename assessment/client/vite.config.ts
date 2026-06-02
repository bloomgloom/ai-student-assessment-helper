import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist') || id.includes('node_modules/react-pdf')) {
            return 'vendor-pdf';
          }
          const codemirrorLanguageMatch = id.match(/node_modules\/@codemirror\/lang-([^/]+)/);
          if (codemirrorLanguageMatch) {
            return `cm-lang-${codemirrorLanguageMatch[1]}`;
          }
          if (id.includes('node_modules/@codemirror') || id.includes('node_modules/@uiw/react-codemirror')) {
            return 'vendor-codemirror';
          }
          if (id.includes('node_modules/@rhwp')) {
            return 'vendor-hwpx';
          }
        },
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
