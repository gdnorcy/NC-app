import { execFile } from 'child_process';
import { promisify } from 'util';
import { describe, test, expect } from 'vitest';

const execFileAsync = promisify(execFile);

// 「import 幽灵名 / 漏 import」整类 bug 的结构性回归（2026-10 真机报修复盘）：
// cardDetail.vue 曾漏 shadeHex：computed 惰性求值 → 渲染数据函数首字段
// ReferenceError → 整页空 data（静态模板在、数据驱动内容全灭，观感=白屏）。
// 原单测逐字钉死错误 import 语句，谁修谁挂，形同虚设；本测试跑
// scripts/audit-imports.mjs 做结构性检查（双向：幽灵 import + 漏 import）。
// ⚠️ 子进程扫 94 个源文件，全量并行下需 >30s，显式放宽超时。
describe('import 双向审计（幽灵 import + 漏 import）', () => {
  test('所有源文件：import 的名字必须真实存在；用了本地导出必须已 import', async () => {
    // 用异步 exec（勿用 execFileSync）：同步子进程会阻塞 worker 事件循环，
    // vitest RPC 心跳超时 →「Timeout calling onTaskUpdate」未处理错误。
    let out = '';
    let failed = false;
    try {
      out = (await execFileAsync(process.execPath, ['scripts/audit-imports.mjs', 'src'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })).stdout;
    } catch (e) {
      failed = true;
      out = (e.stdout || '') + (e.stderr || '');
    }
    if (failed) expect(out, `存在 import 问题：\n${out}`).toBe('');
    expect(out).toContain('import 双向检查通过');
  }, 180000);
});
