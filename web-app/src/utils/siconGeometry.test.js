/**
 * 图标几何与 svgMap 完整性回归（2026-10-16 前端审查 · 方案 A）
 *
 * 病根：60 个图标是手写路径，没有任何光学归一化。浏览器 getBBox 实测：
 *   视觉占比 58.3%（back）~ 100%（settings），极差 41.7 个百分点；
 *   play/pause/back 偏小，solutions/delivery/location/wallet/storage/sms/star 偏心。
 *   同一行里并排出现时「看起来大小不一」，用户感知为「图标没对齐/很糙」。
 *
 * 锁五件事：
 *   ① svgMap 能被 gen-mp-sicons.js 与 server/src/routes/card.js 的**同一正则**完整解析
 *      （两处都是 `^\s*name:\s*'[^']*',$` 逐行匹配 → 值必须是单行单引号字面量，
 *        写成 JS 变量别名会被静默跳过 → MP 端该图标没有烘焙 PNG）
 *   ② 同字形别名必须同步（crown≡badge、chart≡analytics）——正则不支持别名，只能重复字面量
 *   ③ 归一化后的图标：占比 ≥72%、中心偏移 ≤0.75、不越出 24 画布（用 sharp 渲染后从 alpha
 *      通道反推墨迹包围盒——测的是**真实产物**，不是路径数学）
 *   ④ 尺寸档位一律 rpx（与全局 rpx 设计体系同单位）
 *   ⑤ 实心点图标白名单化，SIcon 标签不再出现灰色硬编码色值
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { describe, test, expect } from 'vitest';
import sharp from 'sharp';

const here = import.meta.url;
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, here)), 'utf8');

const SICON_SRC = read('../components/SIcon.vue');

// 与 scripts/gen-mp-sicons.js、server/src/routes/card.js 逐字相同的解析正则
const MAP_RE = /^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*'([^']*)',$/gm;
const ICON_NAMES = [
  'like', 'comment', 'user', 'team', 'building', 'enterprise', 'market', 'exchange',
  'back', 'pool', 'radar', 'customer', 'audit', 'key', 'chart', 'settings', 'template',
  'dynamic', 'play', 'pause', 'dashboard', 'apps', 'orders', 'wallet', 'storage', 'sms',
  'dist', 'partner', 'share', 'category', 'area', 'panorama', 'card', 'channel',
  'solutions', 'users', 'logs', 'crown', 'no-ads', 'shield', 'badge', 'voucher',
  'analytics', 'palette', 'delivery', 'verify', 'show', 'devices', 'wechat', 'alipay',
  'mobile', 'official', 'pc', 'location', 'doc', 'star', 'mail', 'bell', 'cart', 'search',
];
// 同字形别名（正则不支持别名，只能重复字面量；改一处必须改另一处）
const ALIAS_PAIRS = [['crown', 'badge'], ['chart', 'analytics']];
// 2026-10-16 归一化修正的 10 个（3 偏小 + 8 偏心，play 两者皆是）
const NORMALIZED = [
  'back', 'play', 'pause', 'solutions', 'delivery', 'location', 'wallet', 'storage', 'sms', 'star',
];
// 内部用 fill="currentColor" 画实心点的图标（语义点：眼睛/雷达回波/九宫点，属刻意设计）
const SOLID_DOT_ICONS = ['radar', 'dynamic', 'apps', 'wallet', 'storage', 'wechat'];

function parseSvgMap(src) {
  const map = {};
  let m;
  MAP_RE.lastIndex = 0;
  while ((m = MAP_RE.exec(src)) !== null) {
    const name = m[1] || m[2];
    if (name && m[3]) map[name] = m[3];
  }
  return map;
}

const SVG_MAP = parseSvgMap(SICON_SRC);

/** 与 SIcon.vue buildSvgDataUri 同一套 SVG 外壳（color 属性必须给，否则实心点回落黑） */
function wrap(content, hex = '#000000') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" color="${hex}" stroke="${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

/** 剥掉归一化 <g transform>，拿到「修正前」的原始路径 */
function stripTransform(content) {
  const m = content.match(/^<g transform="([^"]+)">([\s\S]*)<\/g>$/);
  return m ? m[2] : content;
}

/**
 * 用 sharp 渲染后从 alpha 通道反推墨迹包围盒（单位 = 24 网格）。
 * 测的是真实产物像素，与浏览器 getBBox 结论一致，但不依赖浏览器。
 */
async function inkBox(content) {
  const { data, info } = await sharp(Buffer.from(wrap(content)), { density: 96 })
    .resize(48, 48)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return { w: 24, h: 24, x0: 0, y0: 0, cx: 12, cy: 12 };
  const f = 48 / 24;
  const w = (x1 - x0 + 1) / f, h = (y1 - y0 + 1) / f;
  return { w, h, x0: x0 / f, y0: y0 / f, cx: (x0 + x1) / 2 / f, cy: (y0 + y1) / 2 / f };
}

const occupancy = (b) => (Math.max(b.w, b.h) / 24) * 100;
const offset = (b) => Math.max(Math.abs(b.cx - 12), Math.abs(b.cy - 12));
// 48px 渲染下像素索引取中会有 0.25（24 单位）的量化底噪：一个几何上完全居中的图标，
// 实测 offset 也是 0.25。故「已居中」判据用 0.75，「不许更差」判据用 1.0（=0.75+0.25）。
const CENTERED = 0.75;
const WORSE_THAN = 1.0;

describe('svgMap 可被构建脚本与服务端完整解析', () => {
  test('60 个图标一个不少（名单锁定）', () => {
    expect(Object.keys(SVG_MAP).sort()).toEqual([...ICON_NAMES].sort());
  });

  test('每个值都是单行单引号字面量（写成 JS 变量别名会被正则静默跳过）', () => {
    // 源码里形如 `name: '...',` 的行数必须与解析出的条数一致
    const declLines = SICON_SRC.split('\n').filter((l) =>
      /^\s*(?:'[a-z0-9-]+'|[a-z0-9-]+):\s*'/.test(l)
    ).length;
    expect(declLines).toBe(Object.keys(SVG_MAP).length);
    for (const [name, v] of Object.entries(SVG_MAP)) {
      expect(v, name).not.toContain("'");
      expect(v, name).not.toContain('\n');
      expect(v.length, name).toBeGreaterThan(10);
    }
  });

  test('同字形别名保持同步', () => {
    for (const [a, b] of ALIAS_PAIRS) {
      expect(SVG_MAP[a], `${a} 与 ${b} 必须同字形`).toBe(SVG_MAP[b]);
    }
  });

  test('归一化图标都包了 <g transform>，且把原中心搬到画布中心', async () => {
    for (const name of NORMALIZED) {
      expect(SVG_MAP[name], name).toMatch(/^<g transform="[^"]+">/);
      const before = await inkBox(stripTransform(SVG_MAP[name]));
      const after = await inkBox(SVG_MAP[name]);
      // 修正前必须是「偏小或偏心」其中之一，否则说明这个修正没有必要性（或改坏了）
      expect(occupancy(before) < 72 || offset(before) > 0.5, `${name} 修正前应是异常的`).toBe(true);
      expect(offset(after), `${name} 修正后应居中`).toBeLessThanOrEqual(CENTERED);
      expect(occupancy(after), `${name} 修正后占比应达标`).toBeGreaterThanOrEqual(72);
    }
  });
});

describe('图标几何：占比 / 居中 / 不越界（sharp 实测产物像素）', () => {
  test('全部 60 个图标达标', async () => {
    const bad = [];
    for (const name of ICON_NAMES) {
      const b = await inkBox(SVG_MAP[name]);
      if (occupancy(b) < 72) bad.push(`${name} 占比 ${occupancy(b).toFixed(1)}% < 72%`);
      if (offset(b) > WORSE_THAN) bad.push(`${name} 偏心 ${offset(b).toFixed(2)} > ${WORSE_THAN}`);
      if (b.x0 < -0.3 || b.y0 < -0.3 || b.x0 + b.w > 24.3 || b.y0 + b.h > 24.3) {
        bad.push(`${name} 越出画布 [${b.x0.toFixed(2)},${b.y0.toFixed(2)},${(b.x0 + b.w).toFixed(2)},${(b.y0 + b.h).toFixed(2)}]`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('占比极差从 41.7pp 收敛（min ≥ 72%）', async () => {
    const occs = [];
    for (const name of ICON_NAMES) occs.push(occupancy(await inkBox(SVG_MAP[name])));
    expect(Math.min(...occs)).toBeGreaterThanOrEqual(72);
  });
});

describe('样式规范', () => {
  test('尺寸档位一律 rpx（不再 px，与全局 rpx 体系同单位）', () => {
    for (const cls of ['small', 'default', 'large', 'xlarge']) {
      const m = SICON_SRC.match(new RegExp(`\\.s-icon--${cls}\\s*\\{[^}]*\\}`));
      expect(m, cls).toBeTruthy();
      expect(m[0], cls).toMatch(/width:\s*\d+rpx/);
      expect(m[0], cls).not.toMatch(/width:\s*\d+px/);
    }
  });

  test('实心点图标白名单化（fill="currentColor" 只允许出现在白名单里）', () => {
    const withDots = Object.entries(SVG_MAP)
      .filter(([, v]) => v.includes('fill="currentColor"'))
      .map(([k]) => k)
      .sort();
    expect(withDots).toEqual([...SOLID_DOT_ICONS].sort());
  });

  test('SIcon 标签不再出现灰色硬编码色值（7 种灰 → utils/iconColor.js 令牌）', () => {
    const GRAYS = ['#c9cdd4', '#9a9a9a', '#8a8f99', '#5b5b5b', '#86909c', '#4e5969', '#1d2129'];
    const srcRoot = fileURLToPath(new URL('..', here)); // src/
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.vue$/.test(f)) files.push(p);
      }
    };
    walk(srcRoot);
    const hits = [];
    for (const f of files) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(/<SIcon\b[^>]*>/g)) {
        for (const g of GRAYS) {
          if (m[0].includes(`color="${g}"`)) hits.push(`${relative(srcRoot, f)}: ${g}`);
        }
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
