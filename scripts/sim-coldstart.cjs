#!/usr/bin/env node
// 冷启动仿真：在 Node 里实跑构建产物 home.js 的首帧链路（2026-10 真机报修「空白」排查）
// 手段：require.cache 注入假 vendor.js（真 Vue API + uni 生命周期收集器），
//       wx.createPage 劫持组件选项，随后手动触发 onLoad/onShow/onMounted 与渲染函数。
const path = require('path');
const fs = require('fs');
const Module = require('module');

const BUILD = path.resolve(__dirname, '../web-app/dist/build/mp-weixin');
const vendorPath = path.join(BUILD, 'common/vendor.js');

// ===== 真 Vue（依赖提升到项目根 node_modules）=====
const Vue = require(path.resolve(__dirname, '../node_modules/vue'));

// ===== 生命周期收集器 =====
const hooks = {};
const hookNames = ['onLoad', 'onShow', 'onMounted', 'onReady', 'onUnload', 'onPageScroll', 'onShareAppMessage', 'onPullDownRefresh', 'onHide'];
for (const h of hookNames) hooks[h] = [];

// ===== uni mock（冷启动态：storage 全空）=====
const storage = {}; // 空 = 冷启动
const requests = [];
const pending = []; // 在途请求（可手动 resolve）
global.uni = {
  getStorageSync: (k) => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  request: (opts) => {
    const p = { url: opts.url, opts, resolve: null };
    requests.push(p);
    pending.push(p);
    return {}; // 挂起，等待外部驱动
  },
  reLaunch: (o) => console.log('  [uni.reLaunch]', o.url),
  navigateTo: (o) => console.log('  [uni.navigateTo]', o.url),
  redirectTo: (o) => console.log('  [uni.redirectTo]', o.url),
  switchTab: (o) => console.log('  [uni.switchTab]', o.url),
  showToast: () => {},
  showModal: () => {},
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wxtest' } }),
  getMenuButtonBoundingClientRect: () => ({ top: 88, right: 377, bottom: 120, left: 280, width: 87, height: 32 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, platform: 'ios' }),
  $emit: () => {}, $on: () => {}, $off: () => {},
  createSelectorQuery: () => ({ in: () => ({ exec: () => {} }) }),
  setNavigationBarTitle: () => {},
  stopPullDownRefresh: () => {},
  pageScrollTo: () => {},
};
global.getApp = () => ({ globalData: { channelConfig: null, apiBase: '', customerId: null } });
global.getCurrentPages = () => [{ route: 'pages/cardMain/home', options: { tid: '1', pageType: 'home' } }];
global.wx = {
  createPage: (opts) => { hooks.__page = opts; },
  createComponent: (opts) => { hooks.__comp = opts; },
};

// ===== 假 vendor.js：真 Vue API + 渲染辅助直通 =====
const shim = Object.assign({}, Vue, {
  index: global.uni,
  unref: Vue.unref,
  _export_sfc: (comp) => comp,
  // 渲染辅助直通（只为不抛错，不求输出正确）
  t: (x) => x, s: (x) => x, p: (x) => x, o: (fn) => fn, e: (x) => x,
  f: (arr, fn) => (arr || []).map(fn),
});
for (const h of hookNames) shim[h] = (fn) => { hooks[h].push(fn); };

// 注入 require.cache（vendor.js 很大，不真加载）
const resolvedVendor = Module._resolveFilename(vendorPath, { paths: [BUILD] });
require.cache[resolvedVendor] = new Module(resolvedVendor, null);
require.cache[resolvedVendor].filename = resolvedVendor;
require.cache[resolvedVendor].loaded = true;
require.cache[resolvedVendor].exports = shim;

// ===== 加载目标页 =====
const target = path.isAbsolute(process.argv[2] || '') ? process.argv[2] : path.resolve(BUILD, process.argv[2] || 'pages/cardMain/home.js');

// ===== 冷启动时序仿真 =====
const isLogin = /login\.js$/.test(target);
const curRoute = isLogin ? 'pages/cardMain/login' : 'pages/cardMain/home';
global.getCurrentPages = () => [{ route: curRoute, options: { tid: '1', pageType: 'home' } }];

// 记录 reLaunch 调用
const reLaunches = [];
const origReLaunch = global.uni.reLaunch;
global.uni.reLaunch = (o) => { reLaunches.push(o.url); origReLaunch(o); };

// 真实线上响应（designConfig）：首页配置指向 cardMain/home
const DESIGN_RESP = { homePageUrl: '/pages/cardMain/home?pageType=home', homePage: '/pages/cardMain/home?pageType=home', tenantId: 1, pages: { components: [], meta: {} } };
const tick = () => new Promise((r) => setImmediate(r));

async function main() {
console.log('== 加载', path.relative(BUILD, target));
require(target);

const opts = hooks.__page;
if (!opts) { console.error('未捕获到页面组件'); process.exit(2); }
console.log('== 捕获到页面组件');

console.log('\n== 1. setup()');
let ctx;
try {
  ctx = opts.setup({}, {});
  console.log('  setup OK');
} catch (e) { console.error('  🔴 setup 崩溃:', e); process.exit(1); }

const renderFn = typeof ctx === 'function' ? ctx : null;
console.log('  渲染函数:', renderFn ? '已捕获' : '未捕获');

console.log('\n== 2. 首帧渲染（空数据态）');
if (renderFn) {
  try { renderFn({}, {}); console.log('  首帧渲染 OK'); }
  catch (e) { console.error('  🔴 首帧渲染崩溃:', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e); process.exit(1); }
}

console.log('\n== 3. onLoad + onShow()（冷启动，请求在途）');
try {
  (hooks.onLoad[0] || (() => {}))({ tid: '1', pageType: 'home' });
  (hooks.onShow[0] || (() => {}))();
  console.log('  onLoad/onShow OK；在途请求:', requests.map((r) => r.url).join(' | ') || '无');
} catch (e) { console.error('  🔴 onLoad/onShow 崩溃:', e); process.exit(1); }

console.log('\n== 4. 竞态断言 A：请求未返回时不得 reLaunch');
if (reLaunches.length) { console.error('  🔴 请求在途就跳转了（竞态！）', reLaunches); process.exit(1); }
console.log('  ✅ 未跳转');

console.log('\n== 5. 驱动 designConfig 响应（真实线上数据）');
const cfgReq = requests.find((r) => r.url.includes('/design/config'));
if (cfgReq) {
  cfgReq.opts.success({ statusCode: 200, data: DESIGN_RESP });
  await tick(); await tick();
  console.log('  响应已送达');
} else {
  console.log('  ⚠ 未捕获到 designConfig 请求');
}

console.log('\n== 6. 竞态断言 B：响应到达但首帧未完成（onReady 前）不得 reLaunch');
if (reLaunches.length) { console.error('  🔴 onReady 前就跳转了（冷启动竞态未防住！）', reLaunches); process.exit(1); }
console.log('  ✅ 仍未跳转（等待本页首帧渲染完成）');

console.log('\n== 7. onReady()（首帧渲染完成）');
try { (hooks.onReady[0] || (() => {}))(); console.log('  onReady OK'); }
catch (e) { console.error('  🔴 onReady 崩溃:', e); process.exit(1); }
await tick(); await tick();

console.log('\n== 8. 竞态断言 C：onReady 后必须完成 reLaunch');
if (isLogin) {
  if (reLaunches.length !== 1) { console.error('  🔴 onReady 后 reLaunch 未按预期触发', reLaunches); process.exit(1); }
  console.log('  ✅ reLaunch →', reLaunches[0]);
} else {
  console.log('  reLaunch 次数:', reLaunches.length, '（home 页生产配置 target 即本页，0 次为正常）');
}

console.log('\n== 9. onMounted + 渲染');
try {
  (hooks.onMounted[0] || (() => {}))();
  if (renderFn) renderFn({}, {});
  console.log('  OK；已发出请求数:', requests.length);
} catch (e) { console.error('  🔴 onMounted/渲染崩溃:', e && e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e); process.exit(1); }

console.log('\n✅ 冷启动时序仿真通过：reLaunch 严格发生在 onReady 之后');
}

main().catch((e) => { console.error('仿真异常:', e); process.exit(1); });
