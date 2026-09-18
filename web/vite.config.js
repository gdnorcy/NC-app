import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pano/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        // 将 three.js 拆分为独立 chunk，配合 Service Worker 预缓存，降低首屏 JS 体积
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
