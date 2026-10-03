// vite.config.js
import { defineConfig } from "file:///Users/linping/Downloads/360%E5%85%A8%E6%99%AF/web-admin/node_modules/vite/dist/node/index.js";
import vue from "file:///Users/linping/Downloads/360%E5%85%A8%E6%99%AF/web-admin/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { resolve } from "path";
var __vite_injected_original_dirname = "/Users/linping/Downloads/360\u5168\u666F/web-admin";
var vite_config_default = defineConfig({
  base: "/admin-assets/",
  plugins: [vue()],
  build: {
    outDir: "../server/public/admin",
    rollupOptions: {
      input: {
        admin: resolve(__vite_injected_original_dirname, "admin.html"),
        customer: resolve(__vite_injected_original_dirname, "customer.html")
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/uploads": "http://localhost:3000"
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbGlucGluZy9Eb3dubG9hZHMvMzYwXHU1MTY4XHU2NjZGL3dlYi1hZG1pblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2xpbnBpbmcvRG93bmxvYWRzLzM2MFx1NTE2OFx1NjY2Ri93ZWItYWRtaW4vdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2xpbnBpbmcvRG93bmxvYWRzLzM2MCVFNSU4NSVBOCVFNiU5OSVBRi93ZWItYWRtaW4vdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgYmFzZTogJy9hZG1pbi1hc3NldHMvJyxcbiAgcGx1Z2luczogW3Z1ZSgpXSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICcuLi9zZXJ2ZXIvcHVibGljL2FkbWluJyxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBhZG1pbjogcmVzb2x2ZShfX2Rpcm5hbWUsICdhZG1pbi5odG1sJyksXG4gICAgICAgIGN1c3RvbWVyOiByZXNvbHZlKF9fZGlybmFtZSwgJ2N1c3RvbWVyLmh0bWwnKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgICcvdXBsb2Fkcyc6ICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMFQsU0FBUyxvQkFBb0I7QUFDdlYsT0FBTyxTQUFTO0FBQ2hCLFNBQVMsZUFBZTtBQUZ4QixJQUFNLG1DQUFtQztBQUl6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsRUFDTixTQUFTLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDZixPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTCxPQUFPLFFBQVEsa0NBQVcsWUFBWTtBQUFBLFFBQ3RDLFVBQVUsUUFBUSxrQ0FBVyxlQUFlO0FBQUEsTUFDOUM7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsWUFBWTtBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
