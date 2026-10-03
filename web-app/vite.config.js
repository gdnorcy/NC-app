import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig({
  base: './',
  plugins: [uni()],
  css: {
    preprocessorOptions: {
      scss: {
        // 当前 vite 5.2 不支持 api:'modern'，且新版 sass（≥1.80）将 legacy-js-api 标记为弃用并中断构建；
        // 通过 silenceDeprecations 抑制该告警（@import→@use 已在本仓消除 import 弃用）
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin'],
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
