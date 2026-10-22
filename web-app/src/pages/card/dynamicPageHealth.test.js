/**
 * 🔴 回归锁：dynamic.vue「整页绑定全灭」事故（2026-10-22 真机截图反馈）
 *
 * 事故还原：用户截图报「我的动态页标题重叠 + 配色不对（粉色）」。根因两处叠加：
 *   ① #312-2 引入 computed 时**漏 import**（script setup 用了 computed 却没从 'vue' 导入）
 *      → setup ReferenceError → 整页绑定全灭：themeStyle/brandVars 失效 → 渐变头露出
 *      品红 fallback(#eb2f96)、PageNav 不挂载 → 自绘头部顶到状态栏与系统时间重叠。
 *       （静态模板在、数据驱动内容全灭——与 cardDetail.vue shadeHex 事故同一族。）
 *   ② 历史遗留：页面自带 .header（又一个「我的动态」+ 发布按钮），与全站统一的 PageNav
 *      标题重复。正确姿势见 collects.vue：操作按钮进 PageNav #right 插槽。
 *
 * 本测试钉死修法；系统性护栏见 scripts/audit-imports.mjs 的 vue 具名导出检查。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const src = () => stripComments(read('./dynamic.vue'));

describe('dynamic.vue 页面健康锁（computed 漏 import 事故回归）', () => {
  test('script 用了 computed 就必须从 vue import（漏 import → setup 抛错 → 整页绑定全灭）', () => {
    const s = src();
    // 本页确实在用 computed（缺这项说明测试没钉到点上）
    expect(/\bcomputed\s*\(/.test(s)).toBe(true);
    const imp = s.match(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/);
    expect(imp).not.toBeNull();
    expect(imp[1]).toMatch(/\bcomputed\b/);
  });

  test('标题只由 PageNav 出：无自绘重复头部（.header/.title 已删）', () => {
    const s = src();
    expect(s).not.toMatch(/<view class="header">/);
    expect(s).not.toMatch(/\.title\s*\{/);
    expect(s).toMatch(/<PageNav title="我的动态" back>/);
  });

  test('发布入口在 PageNav #right 插槽（胶囊避让由 PageNav rightStyle 负责）', () => {
    const s = src();
    expect(s).toMatch(/<template #right>[\s\S]*?class="publish-btn"[\s\S]*?<\/template>/);
  });

  test('无 antd 品红 fallback（#eb2f96/#f759ab 清零，品牌 fallback 统一 #165dff）', () => {
    const raw = read('./dynamic.vue');
    expect(raw).not.toMatch(/#eb2f96/i);
    expect(raw).not.toMatch(/#f759ab/i);
  });
});
