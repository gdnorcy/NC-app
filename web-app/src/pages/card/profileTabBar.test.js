import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

// 底部菜单目标页一致性回归（2026-10-15 真机报修）：
// 「点底部菜单的个人中心，出来页面后没有底部菜单了」。
// 病根：底部菜单（CardTabBar）的「个人中心/我的」指向 /pages/card/profile，
// 而 profile.vue 是唯一没挂 CardTabBar 的菜单目标页——同批的 myCard/market/home/member 全挂了。
// 不变量：菜单指向的每个页面都必须挂 CardTabBar，且根样式留出底部避让。

const profileSrc = readFileSync(fileURLToPath(new URL('./profile.vue', import.meta.url)), 'utf8');
const designSrc = readFileSync(fileURLToPath(new URL('../../utils/design.js', import.meta.url)), 'utf8');
const tabBarSrc = readFileSync(fileURLToPath(new URL('../../components/CardTabBar.vue', import.meta.url)), 'utf8');

/** URL → 页面源码；不存在返回 null（如外链/未注册页） */
function pageSrc(urlPath) {
  const file = fileURLToPath(new URL('../../' + urlPath.replace(/^\//, '') + '.vue', import.meta.url));
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

/** 页面是否挂了底部菜单 */
function hasTabBar(urlPath) {
  const src = pageSrc(urlPath);
  return src !== null && /<CardTabBar[\s/>]/.test(src);
}

/** 提取 DEFAULT_DESIGN_TABS 代码兜底里的 url */
function defaultTabUrls() {
  const block = designSrc.slice(
    designSrc.indexOf('DEFAULT_DESIGN_TABS'),
    designSrc.indexOf('];', designSrc.indexOf('DEFAULT_DESIGN_TABS'))
  );
  return [...block.matchAll(/url:\s*'(\/pages\/[^']+)'/g)].map((m) => m[1]);
}

/** CardTabBar 默认导航（无设计配置时）硬编码的四个目标 */
function fallbackNavUrls() {
  return [...tabBarSrc.matchAll(/(?:goPage\(|reLaunch\(\{\s*url:\s*)'(\/pages\/[^']+)'/g)].map((m) => m[1]);
}

/** 库中 is_default 发布方案的菜单项 url（DB 不存在/无表则跳过，返回 []） */
function publishedSchemeUrls() {
  const dbPath = fileURLToPath(new URL('../../../../server/data/panorama.db', import.meta.url));
  if (!existsSync(dbPath)) return [];
  let db;
  try {
    db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT tab_json FROM tenant_tab_scheme WHERE is_default = 1').all();
    const urls = [];
    for (const r of rows) {
      let cfg;
      try { cfg = JSON.parse(r.tab_json); } catch { continue; }
      const items = Array.isArray(cfg) ? cfg : (Array.isArray(cfg?.items) ? cfg.items : []);
      for (const it of items) if (it && /^\/pages\//.test(it.url || '')) urls.push(it.url);
    }
    return urls;
  } catch { return []; }
  finally { try { db?.close(); } catch {} }
}

describe('profile.vue 挂载底部菜单（本次报修的直接修复）', () => {
  test('模板渲染 CardTabBar', () => {
    expect(profileSrc).toMatch(/<CardTabBar\s*\/>/);
  });

  test('script 引入 CardTabBar', () => {
    expect(profileSrc).toMatch(/import CardTabBar from '\.\.\/\.\.\/components\/CardTabBar\.vue'/);
  });

  test('根样式留出底部避让（≥160rpx，与 member 等页面同批）', () => {
    const m = profileSrc.match(/\.profile-page\s*\{[^}]*padding-bottom:\s*(\d+)rpx/);
    expect(m, '.profile-page 需有 padding-bottom').not.toBe(null);
    expect(Number(m[1])).toBeGreaterThanOrEqual(160);
  });

  test('active 不硬造高亮：默认导航四键不含本页，留空由路由匹配', () => {
    expect(profileSrc).toMatch(/<CardTabBar\s*\/>/); // 无 active 属性
  });
});

describe('不变量：底部菜单指向的每个页面都必须挂 CardTabBar', () => {
  const sources = [
    ['DEFAULT_DESIGN_TABS（代码兜底菜单）', defaultTabUrls()],
    ['CardTabBar 默认导航（无设计配置时）', fallbackNavUrls()],
    ['库中 is_default 发布方案（真实租户配置）', publishedSchemeUrls()],
  ];
  for (const [label, urls] of sources) {
    test(`${label}：全部目标页挂载 CardTabBar`, () => {
      expect(urls.length, `${label} 应能解析出菜单项`).toBeGreaterThan(0);
      const missing = urls.filter((u) => hasTabBar(u) === false);
      expect(missing, `以下菜单目标页漏挂 CardTabBar：${missing.join(', ')}`).toEqual([]);
      // 页面文件必须存在（挂不上的另一种形态：URL 指向不存在的页）
      const absent = urls.filter((u) => pageSrc(u) === null);
      expect(absent, `以下菜单目标页文件不存在：${absent.join(', ')}`).toEqual([]);
    });
  }
});

describe('防回退：菜单项不得再指向无底部菜单的页面', () => {
  test('DEFAULT_DESIGN_TABS 仍含 profile 项（个人中心/我的）', () => {
    expect(defaultTabUrls()).toContain('/pages/card/profile');
  });

  test('profile.vue 不得删回「无 CardTabBar」形态', () => {
    expect(hasTabBar('/pages/card/profile')).toBe(true);
  });
});
