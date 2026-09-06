import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  base: '/admin-assets/',
  plugins: [vue()],
  build: {
    outDir: '../server/public/admin',
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'admin.html'),
        customer: resolve(__dirname, 'customer.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
