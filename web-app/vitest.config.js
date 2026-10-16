import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 源码扫描类测试（iconColor / siconGeometry / tokenAudit 全量 walk src）在并行 worker 下
    // 易因磁盘 I/O 竞争超时；放宽到 30s，快速测试不受影响。
    testTimeout: 30000,
    include: ['src/utils/**/*.test.js', 'src/components/**/*.test.js', 'src/pages/**/*.test.js', 'src/styles/**/*.test.js'],
  },
});
