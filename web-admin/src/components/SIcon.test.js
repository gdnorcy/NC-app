import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================
// SIcon 图标素材守卫
//
// SIcon 按 `src/assets/icons/svg/{name}.svg` 取素材（import.meta.glob），
// 文件不存在时静默渲染成空 SVG —— 后台表现为「图标凭空消失」，极难排查。
// 典型事故：防伪溯源 15 个 Tab 引用了 13 个从未创建的图标名，只有 chart/doc 出图。
//
// 本测试把「代码里引用的图标名」与「实际存在的素材文件」对齐，缺失即失败。
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(SRC_ROOT, 'assets/icons/svg');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(vue|js|ts)$/.test(entry.name) && !entry.name.endsWith('.test.js')) out.push(full);
  }
  return out;
}

const iconFiles = fs.existsSync(ICON_DIR)
  ? fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg'))
  : [];
const available = new Set(iconFiles.map((f) => f.replace(/\.svg$/, '')));

// 引用收集：只认「确定是 SIcon 图标名」的写法，避免把组件类型 key 当图标
function collectRefs() {
  const refs = new Map(); // name -> 引用来源文件
  const add = (name, file) => {
    if (!name) return;
    if (!refs.has(name)) refs.set(name, new Set());
    refs.get(name).add(path.relative(SRC_ROOT, file));
  };

  for (const file of walk(SRC_ROOT)) {
    const src = fs.readFileSync(file, 'utf8');

    // ① 直接写死的 name="xxx"（排除 :name="表达式" 与 v-bind）
    for (const m of src.matchAll(/<SIcon\b[^>]*?(?<![:\w-])name="([A-Za-z0-9_-]+)"/g)) {
      add(m[1], file);
    }

    // ② 显式的图标名清单数组（BUILTIN_ICONS / iconOptions / ...）
    for (const m of src.matchAll(/const\s+([A-Za-z0-9_]*(?:ICONS|iconOptions)[A-Za-z0-9_]*)\s*=\s*\[([\s\S]*?)\]/g)) {
      for (const s of m[2].matchAll(/['"]([A-Za-z0-9_-]+)['"]/g)) add(s[1], file);
    }

    // ③ 只有「import 了 SIcon 的文件」里的 icon: 'xxx' 才是图标名
    //    （设计中心 componentRegistry.js 的 icon: 是组件类型 key → PNG，不算）
    if (/import\s+SIcon\s+from/.test(src)) {
      for (const m of src.matchAll(/\bicon\s*:\s*['"]([A-Za-z0-9_-]+)['"]/g)) add(m[1], file);
    }
  }
  return refs;
}

describe('SIcon 图标素材', () => {
  it('图标素材目录非空', () => {
    expect(available.size).toBeGreaterThan(0);
  });

  it('所有被引用的图标名都有对应 .svg 素材', () => {
    const refs = collectRefs();
    const missing = [...refs.entries()]
      .filter(([name]) => !available.has(name))
      .map(([name, files]) => `${name}（引用于 ${[...files].join(', ')}）`);

    expect(
      missing,
      `以下图标名被代码引用但缺少 src/assets/icons/svg/*.svg 素材，后台会显示为空白图标：\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  }, 30000);

  it('素材风格统一：viewBox 0 0 24 24 + stroke=currentColor + 非空内容', () => {
    const bad = [];
    for (const f of iconFiles) {
      const raw = fs.readFileSync(path.join(ICON_DIR, f), 'utf8');
      const inner = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      if (!inner) { bad.push(`${f}：缺少外层 <svg>`); continue; }
      if (!/viewBox="0 0 24 24"/.test(raw)) bad.push(`${f}：viewBox 不是 0 0 24 24`);
      if (!/stroke="currentColor"/.test(raw)) bad.push(`${f}：未用 currentColor 描边`);
      if (!inner[1].trim()) bad.push(`${f}：内容为空`);
    }
    expect(bad).toEqual([]);
  }, 30000);

  it('已覆盖防伪溯源 Tab 用到的图标名（回归锁定）', () => {
    // 这批图标曾整片缺失（只剩 chart/doc 出图），锁定防止再次回退
    ['box', 'list', 'settings', 'chart', 'clock', 'warning', 'link', 'doc',
      'lock', 'chat', 'shop', 'flash', 'image', 'gift', 'bell'].forEach((n) => {
      expect(available.has(n), `缺少图标素材 ${n}.svg`).toBe(true);
    });
  });
});
