import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 宫格配色收敛回归锁（2026-10-14，用户确认「宫格可自己配，不跟随租户主题」）：
//   9 彩各自为政 → 4 业务域同域同色。默认色板只是起点，每个宫格项的底色
//   仍可在设计中心逐项自选（items.bg 取色器），故收敛落在**默认值**而非渲染逻辑。
// 锁五处副本一致：C 端 home.vue features / componentRegistry 默认项 /
//   后台预览兜底 ComponentRender.nativeGridItems / PeColorPicker 渐变预设 / （DB 存量另由迁移脚本处理）
// 另锁：图标→域映射正确、历史 9 彩+旧预览 9 彩不得残留、四域起点白图标对比度 ≥3:1。
// 姊妹测试：gridOrangeContrast（经营域橙 3.4:1）/ gridYellowContrast（金退出默认位+浅金禁回潮）。

const here = import.meta.url;
const HOME = fileURLToPath(new URL('./home.vue', here));
const REGISTRY = fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js', here));
const PREVIEW = fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/ComponentRender.vue', here));
const PICKER = fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/PeColorPicker.vue', here));

// 4 业务域（与 docs/card-grid-4domain-preview.html 提案一致；经营域橙起点 3.4:1 见 gridOrangeContrast）
const IDENTITY = 'linear-gradient(135deg,#3b6ef7,#6a4bf5)'; // 身份域：名片/交换
const RELATION = 'linear-gradient(135deg,#0a9f8f,#10b981)'; // 关系域：访客/集市/动态
const BIZ = 'linear-gradient(135deg,#e8590c,#f59e0b)';      // 经营域：客户/分销/会员
const TOOL = 'linear-gradient(135deg,#5c6470,#3d424b)';     // 工具域：更多
const DOMAINS = [IDENTITY, RELATION, BIZ, TOOL];

// 图标 → 域（C 端 features 与后台默认项共用同一映射）
const ICON_DOMAIN = {
  card: IDENTITY, exchange: IDENTITY,
  radar: RELATION, market: RELATION, dynamic: RELATION,
  customer: BIZ, dist: BIZ, crown: BIZ,
  apps: TOOL,
};
// 后台预览兜底按 label 映射（该项数据无 icon 字段）
const LABEL_DOMAIN = {
  我的名片: IDENTITY, 名片交换: IDENTITY,
  访客雷达: RELATION, 人脉集市: RELATION, 我的动态: RELATION,
  客户管理: BIZ, 分销中心: BIZ, 会员中心: BIZ,
  更多: TOOL,
};

// 历史色板：C 端/后台默认旧 9 彩 + 后台预览兜底旧 9 彩（整串匹配，避免误伤兜底 hex 的合法用法）
const OLD_GRADIENTS = [
  'linear-gradient(135deg,#2979ff,#00b0ff)', 'linear-gradient(135deg,#00b8a9,#00d68f)',
  'linear-gradient(135deg,#7c4dff,#b388ff)', 'linear-gradient(135deg,#00b0ff,#536dfe)',
  'linear-gradient(135deg,#ff3d3d,#ff7043)', 'linear-gradient(135deg,#cc7a00,#f0a500)',
  'linear-gradient(135deg,#ec407a,#ab47bc)', 'linear-gradient(135deg,#78909c,#546e7a)',
  'linear-gradient(135deg,#165dff,#4080ff)', 'linear-gradient(135deg,#00b42a,#23c343)',
  'linear-gradient(135deg,#ff7d00,#ff9a2e)', 'linear-gradient(135deg,#722ed1,#9254de)',
  'linear-gradient(135deg,#f5319d,#ff7d9b)', 'linear-gradient(135deg,#0fc6c2,#35e0e0)',
  'linear-gradient(135deg,#f7ba1e,#ffd666)', 'linear-gradient(135deg,#4080ff,#7cc5ff)',
  'linear-gradient(135deg,#86909c,#a9b0bb)',
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function relLum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(c1, c2) {
  const l1 = relLum(hexToRgb(c1));
  const l2 = relLum(hexToRgb(c2));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

describe('宫格 4 业务域色板：多副本一致', () => {
  test('C 端 home.vue features 九项按图标映射到正确域', () => {
    const src = readFileSync(HOME, 'utf8');
    const re = /\{ key: '\w+', icon: '(\w+)', label: '[^']+', path: '[^']+', bg: '(linear-gradient\(135deg,#[0-9a-f]{6},#[0-9a-f]{6}\))' \},/g;
    const found = {};
    let m;
    while ((m = re.exec(src))) found[m[1]] = m[2];
    expect(Object.keys(found).sort()).toEqual(Object.keys(ICON_DOMAIN).sort());
    for (const [icon, bg] of Object.entries(found)) {
      expect(bg, `图标 ${icon} 的底色应属正确业务域`).toBe(ICON_DOMAIN[icon]);
    }
  });

  test('componentRegistry 默认项九项按图标映射到正确域', () => {
    const src = readFileSync(REGISTRY, 'utf8');
    const re = /\{ icon: '(\w+)', text: '[^']+', url: '[^']+', bg: '(linear-gradient\(135deg,#[0-9a-f]{6},#[0-9a-f]{6}\))', badge: '', visible: true \}/g;
    const found = {};
    let m;
    while ((m = re.exec(src))) found[m[1]] = m[2];
    expect(Object.keys(found).sort()).toEqual(Object.keys(ICON_DOMAIN).sort());
    for (const [icon, bg] of Object.entries(found)) {
      expect(bg, `图标 ${icon} 的底色应属正确业务域`).toBe(ICON_DOMAIN[icon]);
    }
  });

  test('后台画布预览兜底 nativeGridItems 九项按 label 映射到正确域', () => {
    const src = readFileSync(PREVIEW, 'utf8');
    const re = /\{ label: '([^']+)', bg: '(linear-gradient\(135deg,#[0-9a-f]{6},#[0-9a-f]{6}\))' \}/g;
    const found = {};
    let m;
    while ((m = re.exec(src))) found[m[1]] = m[2];
    expect(Object.keys(found).sort()).toEqual(Object.keys(LABEL_DOMAIN).sort());
    for (const [label, bg] of Object.entries(found)) {
      expect(bg, `预览项「${label}」的底色应属正确业务域`).toBe(LABEL_DOMAIN[label]);
    }
  });

  test('三个宫格默认位副本都含全 4 域色（不缺域）', () => {
    for (const f of [HOME, REGISTRY, PREVIEW]) {
      const src = readFileSync(f, 'utf8');
      for (const d of DOMAINS) {
        expect(src, `${f.split('/').slice(-1)[0]} 应含 ${d}`).toContain(d);
      }
    }
  });

  test('PeColorPicker 渐变预设以 4 域色打头（自选时的首选即收敛色）', () => {
    const src = readFileSync(PICKER, 'utf8');
    for (const d of DOMAINS) expect(src).toContain(d);
    // 预设顺序：4 域在前（数组前 4 项即 4 域，按源码行序断言）
    const firstFour = DOMAINS.map((d) => src.indexOf(d));
    expect(Math.max(...firstFour)).toBeLessThan(src.indexOf('#7c4dff'));
  });

  test('三个宫格默认位副本不得残留历史 9 彩/旧预览 9 彩', () => {
    for (const f of [HOME, REGISTRY, PREVIEW]) {
      const src = readFileSync(f, 'utf8');
      for (const g of OLD_GRADIENTS) {
        expect(src, `${f.split('/').slice(-1)[0]} 不得残留 ${g}`).not.toContain(g);
      }
    }
  });
});

describe('宫格 4 业务域色板：白图标对比度', () => {
  for (const [name, gradient] of [['身份域', IDENTITY], ['关系域', RELATION], ['经营域', BIZ], ['工具域', TOOL]]) {
    const start = gradient.match(/#([0-9a-f]{6})/)[1];
    test(`白图标在${name}起点 #${start} 上对比度 ≥ 3:1（图标非文本底线）`, () => {
      expect(contrast('#ffffff', `#${start}`)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('native-market 区块与宫格同域同色（2026-10-16 补漏，真机截图报修）', () => {
  // 病根：上面 OLD_GRADIENTS 禁令只匹配**无空格**渐变串，而 .market-avatar 写的是
  // **带空格**变体、区块头部图标是**裸 hex** 旧紫 —— 两头躲过禁令，紫色遗留到真机。
  // 本锁按「效果」断言：头像渐变=关系域、图标=关系域起点、home.vue 零旧紫残留。
  test('home.vue .market-avatar 背景用关系域渐变', () => {
    const src = readFileSync(HOME, 'utf8');
    const avatar = src.match(/\.market-avatar\s*\{[^}]*\}/);
    expect(avatar, '.market-avatar 规则块应存在').not.toBeNull();
    // 剥 CSS 注释 + 逗号后空格归一化，避免「带空格写法」绕过域色断言（旧紫正是钻这个空子）
    const norm = avatar[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/,\s*/g, ',');
    expect(norm).toContain(RELATION);
  });
  test('home.vue 集市头部图标用关系域起点 #0a9f8f', () => {
    const src = readFileSync(HOME, 'utf8');
    expect(src).toMatch(/name="market"[^>]*color="#0a9f8f"/);
  });
  test('home.vue 零旧紫残留（带空格/无空格渐变 + 裸 hex，含注释）', () => {
    const src = readFileSync(HOME, 'utf8');
    for (const bad of ['#722ed1', '#9254de', 'linear-gradient(135deg, #722ed1, #9254de)', 'linear-gradient(135deg,#722ed1,#9254de)']) {
      expect(src, `不得残留旧紫 ${bad}`).not.toContain(bad);
    }
  });
});
