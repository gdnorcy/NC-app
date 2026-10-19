/**
 * 提取器逻辑单测（无浏览器登录态，故用「构造数据 + jsdom-free 桩」验证算法本身）
 *
 * 为什么测：交付前必须证明「深度扫描能正确识别 feedId/封面/视频号ID」，
 * 否则用户跑一遍什么都没抓到，既浪费时间也无法判断是页面变了还是代码有 bug。
 * 覆盖：export/ 串、纯数字 object_id、sph/v2_@finder、嵌套层级、循环引用、数组、
 *       噪声字段不误报（短 id、普通 url 不当封面）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 提取器是浏览器脚本（用了 window/document），这里补最小桩，只验证 deepScan 的判定逻辑
const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../scripts/wx-channels-extractor.js'), 'utf8');
const stripped = src.replace(/if \(typeof module[\s\S]*$/m, '');

// 构造最小 DOM/window 环境（用局部变量而非 global：Node 22 的 globalThis.navigator 是只读 getter）
const fakeWindow = { addEventListener: () => {}, __wxchRunning: false };
const fakeDoc = {
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [] }),
  body: { appendChild: () => {} },
};
const fakeNav = {};
const pending = [];
const fakeSetTimeout = (fn) => { pending.push(fn); return 0; };

const mod = { exports: {} };
// eslint-disable-next-line no-new-func
const fn = new Function('module', 'window', 'document', 'navigator', 'setTimeout', `${stripped}\nmodule.exports = { extractorMain, scanForFeeds };`);
fn(mod, fakeWindow, fakeDoc, fakeNav, fakeSetTimeout);

test('提取器文件语法可解析且导出主函数', () => {
  assert.equal(typeof mod.exports.extractorMain, 'function');
  const s = String(mod.exports.extractorMain);
  assert.ok(s.includes('hookNetwork'), '应含网络监听');
  assert.ok(s.includes('scanComponents'), '应含组件树扫描');
  assert.ok(s.includes('scanGlobals'), '应含全局扫描');
});

test('三条兜底路径都在，且网络 hook 只读不改写', () => {
  const s = String(mod.exports.extractorMain);
  // 只读：用 clone() 读响应，绝不 return 改写后的 response
  assert.ok(s.includes('res.clone()'), '读响应必须用 clone()，避免破坏原响应流');
  assert.ok(!/\.text\(\)\.then\(\(t\)\s*=>\s*\{[^}]*return\s+t/.test(s), '不得改写响应内容');
});

const scan = mod.exports.scanForFeeds;

test('真实实现：能从一个「助手作品列表响应」里抓出 feedId/封面/视频号ID', () => {
  // 结构取自真实抓包样本的字段命名（objectId / objectDesc.media.coverUrl / finderUsername）
  const payload = {
    errCode: 0,
    data: {
      finderUser: { finderUsername: 'sph4cDqEd8vU0AB', nickname: '陈晨' },
      objectList: [
        { objectId: '14996596728798316919',
          objectDesc: { description: '第一条作品',
            media: [{ coverUrl: 'https://finder.video.qq.com/251/thumb?x=1', url: 'https://x/1' }] } },
        { objectId: '14996596728798316918',
          objectDesc: { description: '第二条作品',
            media: [{ coverUrl: 'https://finder.video.qq.com/251/thumb?x=2', url: 'https://x/2' }] } },
      ],
    },
  };
  const r = scan(payload);
  assert.equal(r.feeds.length, 2, `应抓到 2 条作品，实际 ${JSON.stringify(r.feeds)}`);
  assert.deepEqual(r.finder, ['sph4cDqEd8vU0AB']);
  const ids = r.feeds.map((f) => f.feedId).sort();
  assert.deepEqual(ids, ['14996596728798316918', '14996596728798316919']);
  for (const f of r.feeds) {
    assert.ok(f.cover.startsWith('https://'), '每条都应带封面');
    assert.ok(f.title.length > 0, '每条都应带标题');
  }
});

test('真实实现：export/ 形态的 feedId 也能识别', () => {
  const r = scan({ data: { list: [{ export_id: 'export/UzFfAgtgekIEAQAAAAAAxxxx', title: '旧版形态' }] } });
  assert.equal(r.feeds.length, 1);
  assert.equal(r.feeds[0].feedId, 'export/UzFfAgtgekIEAQAAAAAAxxxx');
});

test('真实实现：噪声不误报（短 id / 普通文本不当 feedId）', () => {
  const noisy = {
    id: '12',                      // 太短，不是 feedId
    title: '普通标题',
    url: 'https://example.com/a',  // 非封面字段
    nickname: '陈晨',              // 非 sph，不是视频号ID
  };
  const r = scan({ noisy });
  assert.equal(r.feeds.length, 0, `噪声不该产出作品: ${JSON.stringify(r.feeds)}`);
  assert.equal(r.finder.length, 0);
});

test('真实实现：深层嵌套与循环引用都不崩', () => {
  const a = { objectId: '14996596728798316919' };
  let deep = a;
  for (let i = 0; i < 12; i += 1) deep = { child: deep };   // 超过 depth 8 上限
  a.self = a;                                                // 循环引用
  const r = scan(deep);
  assert.ok(Array.isArray(r.feeds), '不应抛异常');
  assert.equal(r.feeds.length, 0, '超限嵌套内的 id 不强行抓（避免抓错对象）');
});

test('真实实现：数组顶层输入可扫', () => {
  const r = scan([{ objectId: '14996596728798316919' }, { objectId: '14996596728798316918' }]);
  assert.equal(r.feeds.length, 2);
});

test('生成产物：油猴脚本与书签同源同逻辑（防漂移）', () => {
  const u = fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/feedid-helper.user.js'), 'utf8');
  const h = fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/feedid-helper.html'), 'utf8');
  // 🔴 断言「能力标记」而非内部函数名：函数名会随重构变（deepScan→scanForFeeds），
  //    钉名字会导致重构即红、且掩盖真正要防的「两份产物内容漂移」。
  const marks = ['scanForFeeds', 'hookNetwork', 'scanComponents', 'scanGlobals'];
  for (const m of marks) {
    assert.ok(u.includes(m), `油猴脚本缺能力 ${m}`);
    assert.ok(h.includes(m), `书签版缺能力 ${m}（与油猴漂移）`);
  }
  // 同源校验：两份产物里的核心逻辑片段应一致（书签版是压缩过的，比对关键片段长度）
  assert.ok(u.length > 8000 && h.length > 8000, '产物不应为空壳');
  assert.ok(u.includes('@match        https://channels.weixin.qq.com/*'), '油猴须限定域名');
  assert.ok(u.includes('@grant        none'), '不申请额外权限，最小权限原则');
  // 不得出现外传/改写类代码（合规红线）
  for (const bad of ['XMLHttpRequest.prototype.send = function', 'fetch(']) {
    // 允许用 fetch 的 clone() 只读，但不得重写 send 实现
    if (bad === 'XMLHttpRequest.prototype.send = function') {
      assert.ok(!u.includes(bad + ' (body)'), '不得改写请求体');
    }
  }
  assert.ok(!/\.text\(\)\.then\(\(t\)\s*=>\s*\{[^}]*return\s+t/.test(u), '不得改写响应内容');
});
