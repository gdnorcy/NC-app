/**
 * 视频号助手「作品 ID / 封面」提取器（2026-10-19）
 *
 * 背景：名片挂视频号作品需要 finderUserName + feedId，官方唯一合规来源是视频号助手，
 * 但要求商家在电脑端手工抄两个 ID，门槛高、易抄错。本工具在**用户自己已登录的**
 * channels.weixin.qq.com 页面上下文里运行（同源、无代理、无逆向），读取数据后本地展示，
 * 用户复制粘贴即可。
 *
 * 设计原则：
 * - 🔴 不劫持、不改写页面，不拦截改写任何请求（区别于 res-downloader 的 MITM 注入思路）
 * - 🔴 只读：不 POST、不外传任何数据（商家账号数据敏感，必须本地闭环）
 * - 多路径兜底：页面结构随时可能变，单一路径必然失效。三条路并行：
 *     ① 被动监听接口响应（用户翻页时自然产生）→ 最可靠
 *     ② 遍历 Vue/React 组件树里的内存数据
 *     ③ 扫描 window 上的全局对象
 * - 拿不到就如实说，并把「扫到了什么」诊断出来，便于基于真实结构迭代
 *
 * 运行方式（由 build-feedid-helper.mjs 注入到油猴脚本/书签小工具，勿在此写死包装）：
 *   __WXCH_EXTRACTOR__()  启动浮层
 */
'use strict';

// ================= 特征判定 =================
// feedId 两种形态：export/UzFf...（导出串）或纯数字长串（object_id）
const FEED_KEY = /(feed[_]?id|object[_]?id|export[_]?id|eid|^id$)/i;
const FEED_VAL = /^(export\/|\d{12,25}$|[A-Za-z0-9_\-]{16,}$)/;
// 视频号ID：官方 sph 开头；底层标识是 v2_xxx@finder
const FINDER_KEY = /(finder[_]?user[_]?name|finderusername|username|^nickname$)/i;
const FINDER_VAL = /^sph|^v2_.*@finder$/;
const COVER_KEY = /(cover[_]?url|thumb[_]?url|head[_]?url|cover|thumb|picurl)/i;
const TITLE_KEY = /(title|description|desc|object_desc)/i;

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isUrl = (v) => isStr(v) && /^https?:\/\//.test(v);

/**
 * 纯函数：从任意对象里扫出作品条目。
 * 🔴 独立成顶层函数是为了可测——测试直接调它，而不是把正则抄一份去测
 *    （抄一份 = 测试与实现各写一遍，必然漂移，且会「锁死 bug」）。
 * @returns {{feeds: Array<{feedId,title,cover,finder}>, finder: string[], scanned: number}}
 */
function scanForFeeds(data) {
  const feeds = new Map();
  const finder = new Set();
  let scanned = 0;

  function add(bucket) {
    if (!bucket.feedId) return;
    const e = feeds.get(bucket.feedId) || {};
    feeds.set(bucket.feedId, {
      feedId: bucket.feedId,
      title: bucket.title || e.title || '',
      cover: bucket.cover || e.cover || '',
      finder: bucket.finder || e.finder || '',
    });
  }

  // 🔴 关键：字段常分散在**不同层级**（objectId 在外层、coverUrl 在 objectDesc.media[0] 里）。
  //    只在「同一对象内」组装会抓到 ID 却丢封面 —— 必须先让子节点的字段**向上冒泡**，
  //    再在离 ID 最近的祖先节点上组装。
  function walk(node, depth, seen) {
    if (depth > 8 || !node || typeof node !== 'object') return null;
    if (seen.has(node)) return null;
    seen.add(node);
    scanned += 1;

    const bucket = { feedId: '', title: '', cover: '', finder: '' };
    const entries = Array.isArray(node) ? node.map((v, i) => [String(i), v]) : Object.entries(node);
    for (const [k, v] of entries) {
      if (v === null || v === undefined) continue;
      if (isStr(v)) {
        if (FEED_KEY.test(k) && FEED_VAL.test(v)) bucket.feedId = v;
        else if (FINDER_KEY.test(k) && FINDER_VAL.test(v)) { bucket.finder = v; finder.add(v); }
        else if (COVER_KEY.test(k) && isUrl(v)) bucket.cover = v;
        else if (TITLE_KEY.test(k) && v.length > 1 && !isUrl(v)) bucket.title = v.slice(0, 120);
      } else if (typeof v === 'object') {
        const sub = walk(v, depth + 1, seen);
        // 冒泡：子节点捞到的字段补到本层空缺处（本层优先，不覆盖已有值）
        if (sub) {
          bucket.feedId = bucket.feedId || sub.feedId;
          bucket.cover = bucket.cover || sub.cover;
          bucket.title = bucket.title || sub.title;
          bucket.finder = bucket.finder || sub.finder;
        }
      }
    }
    if (bucket.feedId) add(bucket);
    return bucket;
  }

  walk(data, 0, new WeakSet());
  return { feeds: [...feeds.values()], finder: [...finder], scanned };
}

function extractorMain() {
  if (window.__wxchRunning) return;
  window.__wxchRunning = true;

  // ================= 数据收集 =================
  // 复用顶层纯函数 scanForFeeds（可单测），这里只做「多来源结果合并」
  const store = {
    feeds: new Map(), // feedId -> {feedId, title, cover, finder}
    finder: new Set(),
    raw: [],          // 捕获到的原始响应（仅存结构摘要，避免占内存）
    scanned: 0,
  };

  function scanRoot(root) {
    if (!root || typeof root !== 'object') return;
    try {
      const r = scanForFeeds(root);
      store.scanned += r.scanned;
      for (const f of r.feeds) {
        const e = store.feeds.get(f.feedId) || {};
        store.feeds.set(f.feedId, {
          feedId: f.feedId,
          title: f.title || e.title || '',
          cover: f.cover || e.cover || '',
          finder: f.finder || e.finder || '',
        });
      }
      for (const x of r.finder) store.finder.add(x);
    } catch (e) { /* 单个根异常不影响其他来源 */ }
  }

// ---------- 路径①：被动监听接口响应 ----------
  // 只读取、原样放行，绝不改写（res-downloader 靠改写 JS 注入，那是逆向、会随页面改版失效）
  function hookNetwork() {
    const KEY_API = /(finder|feed|object|channels)/i;
    const tryParse = (text) => {
      if (!text || text.length > 4e6) return null;
      if (text[0] !== '{' && text[0] !== '[') return null;
      try { return JSON.parse(text); } catch { return null; }
    };
    const record = (url, data) => {
      if (!data) return;
      store.raw.push({ url: String(url).slice(0, 120), t: Date.now() });
      scanRoot(data, 'net');
      render();
    };

    const of = window.fetch;
    if (of) {
      window.fetch = function (...a) {
        const u = (a[0] && a[0].url) || a[0] || '';
        return of.apply(this, a).then((res) => {
          try {
            if (KEY_API.test(String(u))) {
              res.clone().text().then((t) => record(u, tryParse(t))).catch(() => {});
            }
          } catch (e) {}
          return res;
        });
      };
    }
    const OXML = window.XMLHttpRequest;
    if (OXML) {
      const open = OXML.prototype.open;
      const send = OXML.prototype.send;
      OXML.prototype.open = function (m, u, ...r) { this.__u = u; return open.call(this, m, u, ...r); };
      OXML.prototype.send = function (...a) {
        try {
          this.addEventListener('load', () => {
            try {
              if (KEY_API.test(String(this.__u))) record(this.__u, tryParse(this.responseText));
            } catch (e) {}
          });
        } catch (e) {}
        return send.apply(this, a);
      };
    }
  }

  // ---------- 路径②：组件树 ----------
  function scanComponents() {
    const nodes = document.querySelectorAll('*');
    let n = 0;
    for (const el of nodes) {
      if (n > 4000) break; // 只扫前若干节点，避免大列表卡顿
      n += 1;
      // Vue2
      if (el.__vue__) scanRoot(el.__vue__.$data ? el.__vue__.$data : el.__vue__, 'vue2');
      // Vue3：实例挂在 __vueParentComponent
      let c = el.__vueParentComponent;
      let d = 0;
      while (c && d < 4) {
        if (c.proxy) scanRoot(c.proxy, 'vue3');
        if (c.setupState) scanRoot(c.setupState, 'vue3setup');
        c = c.parent; d += 1;
      }
      // React
      const rk = Object.keys(el).find((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
      if (rk && el[rk]) scanRoot(el[rk], 'react');
    }
  }

  // ---------- 路径③：window 全局 ----------
  function scanGlobals() {
    const keys = Object.keys(window).filter((k) => !/^(webkit|chrome|moz|ms|on)/i.test(k));
    for (const k of keys) {
      let v;
      try { v = window[k]; } catch (e) { continue; }
      if (v && typeof v === 'object') scanRoot(v, 'win.' + k);
    }
  }

  // ================= UI =================
  let panel = null;
  function render() {
    if (!panel) return;
    const list = [...store.feeds.values()];
    const box = panel.querySelector('#wxch-list');
    const meta = panel.querySelector('#wxch-meta');
    meta.textContent = `已捕获 ${list.length} 条作品 · 视频号ID ${store.finder.size} 个 · 接口 ${store.raw.length} 次`;

    if (!list.length) {
      box.innerHTML = `<div style="padding:10px;color:#86909c;font-size:12px;line-height:1.7">
        还没抓到数据。<br>请在本页<strong>滚动/翻页</strong>作品列表（让接口跑一次），<br>
        或点「重新扫描页面」。<br>
        <span style="color:#c9cdd4">已扫描对象 ${store.scanned} 个 / 接口 ${store.raw.length} 次</span>
      </div>`;
      return;
    }
    box.innerHTML = list.map((f, i) => `
      <div style="display:flex;gap:8px;padding:8px;border-bottom:1px solid #f0f0f0;align-items:flex-start">
        ${f.cover
          ? `<img src="${f.cover}" style="width:56px;height:56px;object-fit:cover;border-radius:4px;flex:none" onerror="this.style.display='none'">`
          : `<div style="width:56px;height:56px;background:#f2f3f5;border-radius:4px;flex:none"></div>`}
        <div style="flex:1;min-width:0;font-size:12px">
          <div style="color:#1d2129;line-height:1.4;word-break:break-all">${(f.title || '（无标题）').replace(/</g, '&lt;')}</div>
          <div style="color:#86909c;margin-top:3px;word-break:break-all;font-family:monospace;font-size:11px">${f.feedId}</div>
          <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">
            <button data-i="${i}" data-k="feedId" style="font-size:11px;padding:2px 8px;cursor:pointer">复制 feedId</button>
            ${f.cover ? `<button data-i="${i}" data-k="cover" style="font-size:11px;padding:2px 8px;cursor:pointer">复制封面</button>` : ''}
          </div>
        </div>
      </div>`).join('');

    box.querySelectorAll('button[data-i]').forEach((b) => {
      b.onclick = () => {
        const f = list[+b.dataset.i];
        copy(b.dataset.k === 'cover' ? f.cover : f.feedId);
        b.textContent = '已复制 ✓';
        setTimeout(() => { b.textContent = b.dataset.k === 'cover' ? '复制封面' : '复制 feedId'; }, 1500);
      };
    });
  }

  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'wxch-helper';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:340px;max-height:76vh;z-index:2147483000;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,.18);font:13px/1.5 -apple-system,"PingFang SC",sans-serif;' +
      'display:flex;flex-direction:column;overflow:hidden;color:#1d2129';
    panel.innerHTML = `
      <div style="padding:10px 12px;background:#f7f8fa;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px">
        <strong style="flex:1;font-size:13px">视频号作品提取</strong>
        <span id="wxch-close" style="cursor:pointer;color:#86909c;padding:0 4px">✕</span>
      </div>
      <div id="wxch-meta" style="padding:6px 12px;color:#86909c;font-size:11px;background:#fafbfc"></div>
      <div id="wxch-list" style="flex:1;overflow:auto"></div>
      <div style="padding:8px 12px;border-top:1px solid #eee;display:flex;gap:6px;flex-wrap:wrap">
        <button id="wxch-scan" style="font-size:12px;padding:4px 10px;cursor:pointer">重新扫描页面</button>
        <button id="wxch-all" style="font-size:12px;padding:4px 10px;cursor:pointer">复制全部 JSON</button>
      </div>
      <div style="padding:6px 12px 10px;color:#a9aeb8;font-size:10px;line-height:1.6;border-top:1px solid #f5f5f5">
        仅在本机读取当前页面数据，不上传、不改写任何请求。
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#wxch-close').onclick = () => {
      panel.remove(); panel = null; window.__wxchRunning = false;
    };
    panel.querySelector('#wxch-scan').onclick = () => {
      store.scanned = 0;
      scanComponents(); scanGlobals(); render();
    };
    panel.querySelector('#wxch-all').onclick = () => {
      const arr = [...store.feeds.values()];
      copy(JSON.stringify({ list: arr, finder: [...store.finder] }, null, 2));
      const b = panel.querySelector('#wxch-all');
      b.textContent = '已复制 ✓';
      setTimeout(() => { b.textContent = '复制全部 JSON'; }, 1500);
    };
    render();
  }

  // ================= 启动 =================
  hookNetwork();
  buildPanel();
  // 首屏数据常在 DOM 就绪后才挂上，延迟再扫一次
  setTimeout(() => { scanComponents(); scanGlobals(); render(); }, 600);
  return { store, scanComponents, scanGlobals, render };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { extractorMain };
