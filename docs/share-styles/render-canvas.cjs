// 用真实 canvas 渲染 6 款分享封面并导出 PNG —— 验证「画出来真的对」
// 复刻 web-app/src/utils/shareCover.js 的绘制逻辑（同一套版式，浏览器端直出）
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const CARD = {
  name: '林平', position: '副会长', company: '东莞市揭阳商会',
  phone: '13412888000', city: '东莞市', slogan: '连接湾区资源 · 共创商业价值',
  needTags: JSON.stringify(['商会', '资源对接', '会员']),
};
const COLORS = { primary: '#165DFF', gradient: '#0E42D2', secondary: '#5C8BFF' };

// 把 shareCover.js 的源码读进来，在页面里 eval（保证测的是**真实实现**）
const SHARE_COVER_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../web-app/src/utils/shareCover.js'), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  // 先在页面里造一张「二维码」贴图（黑白方格），用于验证带码排版
  const QR_DATA_URL = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200);
    x.fillStyle = '#000';
    const n = 21, cell = 200 / n;
    for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) {
      const corner = (r < 7 && cc < 7) || (r < 7 && cc >= n - 7) || (r >= n - 7 && cc < 7);
      const on = corner
        ? (r % (n - 7) === 0 || r % (n - 7) === 6 || cc % (n - 7) === 0 || cc % (n - 7) === 6 || (r % (n - 7) >= 2 && r % (n - 7) <= 4 && cc % (n - 7) >= 2 && cc % (n - 7) <= 4))
        : ((r * 7 + cc * 13 + r * cc) % 5 < 2);
      if (on) x.fillRect(cc * cell, r * cell, cell, cell);
    }
    return c.toDataURL('image/png');
  });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.setContent(`<html><body style="margin:0;background:#fff">
    <canvas id="c" width="750" height="600"></canvas>
  </body></html>`);

  // 注入真实实现（去掉 ESM import/export，用 eval 包裹）
  const result = await page.evaluate(async ({ src, card, colors, qrDataUrl }) => {
    // 去掉 export 关键字，转成可执行脚本
    const body = src
      .replace(/^export\s+/gm, '')
      .replace(/^import .*$/gm, '');
    // 暴露到全局
    const fn = new Function(`${body}\nreturn { drawShareCover, SHARE_STYLES, SHARE_COVER_W, SHARE_COVER_H };`);
    const api = fn();
    const ctx = document.getElementById('c').getContext('2d');
    const out = {};
    for (const s of api.SHARE_STYLES) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 800, 700);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 800, 700);
      const qi = new Image();
      await new Promise((res) => { qi.onload = res; qi.onerror = res; qi.src = qrDataUrl; });
      api.drawShareCover(ctx, card, s.key, colors, { W: api.SHARE_COVER_W, H: api.SHARE_COVER_H, qrImage: qi });
      out[s.key] = document.getElementById('c').toDataURL('image/png');
      ctx.restore();
    }
    return { out, keys: api.SHARE_STYLES.map(s => s.key) };
  }, { src: SHARE_COVER_SRC, card: CARD, colors: COLORS, qrDataUrl: QR_DATA_URL });

  const keys = result.keys;
  for (const k of keys) {
    const b64 = result.out[k].split(',')[1];
    const p = path.join(OUT, `canvas-${k}.png`);
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    const size = fs.statSync(p).size;
    console.log(`  ✅ ${k} → ${path.basename(p)}  ${size}KB`);
  }

  // 拼一张对比图
  await page.setContent(`<html><body style="margin:0;background:#e9ecf0;padding:16px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1100px">
      ${keys.map(k => `<div><img src="${result.out[k]}" style="width:100%;display:block;border-radius:8px"><div style="text-align:center;font:13px sans-serif;padding:6px">${k}</div></div>`).join('')}
    </div>
  </body></html>`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'canvas-all.png'), fullPage: true });

  console.log(errors.length ? '\n❌ JS 错误: ' + errors.join(' | ') : '\n✅ 无 JS 运行时错误');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
