// 个性化分享原型 —— 无头实测
// 验证：封面切换真的换图、标题实时联动、空标题保存置灰、5:4 比例真实成立
const { chromium } = require('playwright-core');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'prototype.html');
const OUT = path.resolve(__dirname, 'shots');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(FILE, { waitUntil: 'networkidle' });

  const results = [];
  const ck = (n, cond, extra = '') => results.push({ n, cond, extra });

  // 1. 初始态
  const initSrc = await page.getAttribute('#pv-img', 'src');
  ck('初始封面 = cover-1', initSrc === 'cover-1.png', initSrc);
  ck('初始选中项 = 第 1 个', await page.locator('.cover-item.on').count() === 1);
  ck('初始选中项是 cover-1', await page.locator('.cover-item.on').getAttribute('data-id') === 'cover-1');

  // 2. 切到第 4 款（暗调商务=cover-3，全幅人像=cover-4）
  await page.locator('.cover-item[data-id="cover-4"]').click();
  await page.waitForTimeout(150);
  const src4 = await page.getAttribute('#pv-img', 'src');
  ck('点击后预览换图 → cover-4', src4 === 'cover-4.png', src4);
  ck('选中态跟随移动', await page.locator('.cover-item.on').getAttribute('data-id') === 'cover-4');
  ck('仅一个选中态', await page.locator('.cover-item.on').count() === 1);
  // 预览图真的加载出来了（naturalWidth > 0）
  const natW = await page.evaluate(() => document.getElementById('pv-img').naturalWidth);
  ck('预览图实际加载成功(naturalWidth>0)', natW > 0, 'naturalWidth=' + natW);

  // 3. 标题实时联动
  await page.fill('#title', '林平 · 副会长 · 东莞市揭阳商会');
  await page.waitForTimeout(100);
  const pvT = await page.textContent('#pv-title');
  ck('标题实时联动到预览', pvT === '林平 · 副会长 · 东莞市揭阳商会', pvT);
  const cnt = await page.textContent('#cnt');
  // 计数应等于实际输入长度（不要写死字面值，容易数错——'林平 · 副会长 · 东莞市揭阳商会' 是 18 字）
  const expectLen = '林平 · 副会长 · 东莞市揭阳商会'.length;
  ck('字数计数更新', cnt === `${expectLen}/30`, `${cnt}（期望 ${expectLen}/30）`);

  // 4. 空标题 → 保存置灰
  await page.fill('#title', '');
  await page.waitForTimeout(100);
  ck('空标题 → 保存置灰', await page.isDisabled('#save'));
  ck('空标题 → 预览显示占位', (await page.textContent('#pv-title')) === '（未设置标题）');
  await page.fill('#title', '   ');
  await page.waitForTimeout(100);
  ck('纯空格也置灰(trim)', await page.isDisabled('#save'));

  // 5. 有标题 → 可保存
  await page.fill('#title', '点击保存对方名片');
  await page.waitForTimeout(100);
  ck('有标题 → 保存可点', !(await page.isDisabled('#save')));

  // 6. 5:4 比例实测（微信硬约束）
  const box = await page.locator('.wx-cover').boundingBox();
  const ratio = box.width / box.height;
  ck('预览封面槽 = 5:4（误差<1%）', Math.abs(ratio - 1.25) / 1.25 < 0.01, `ratio=${ratio.toFixed(4)}`);

  // 7. 缩略图同样是 5:4
  const tb = await page.locator('.cover-thumb').first().boundingBox();
  ck('缩略图 = 5:4（误差<1%）', Math.abs(tb.width / tb.height - 1.25) / 1.25 < 0.01,
     `ratio=${(tb.width / tb.height).toFixed(4)}`);

  // 8. 6 张封面图全部加载成功（无 404）
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('#thumbs img, .cover-thumb')].length);
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('#thumbs img')].filter(i => !i.naturalWidth).map(i => i.src));
  ck('右侧 6 张大图全部加载', broken.length === 0, broken.join(','));
  ck('缩略图元素数 = 6', await page.locator('.cover-item').count() === 6);

  // 9. 风格库可横向滚动（内容宽 > 容器宽）
  const scrollable = await page.evaluate(() => {
    const el = document.getElementById('covers');
    return el.scrollWidth > el.clientWidth + 10;
  });
  ck('风格库可横向滚动', scrollable);

  // 10. 保存点击 → 弹确认（含风格与标题）
  let alertText = '';
  page.on('dialog', async d => { alertText = d.message(); await d.accept(); });
  await page.click('#save');
  await page.waitForTimeout(200);
  ck('保存弹确认含风格名', alertText.includes('全幅人像'), alertText.slice(0, 60));
  ck('保存弹确认含标题', alertText.includes('点击保存对方名片'));

  // 截图
  await page.screenshot({ path: path.join(OUT, 'prototype-full.png'), fullPage: true });
  const phone = page.locator('.phone');
  await phone.screenshot({ path: path.join(OUT, 'phone.png') });
  // 切到第 6 款再截一张
  await page.locator('.cover-item[data-id="cover-6"]').click();
  await page.waitForTimeout(200);
  await phone.screenshot({ path: path.join(OUT, 'phone-cover6.png') });

  ck('无 JS 运行时错误', errors.length === 0, errors.join(' | '));

  await browser.close();

  let ok = 0;
  for (const r of results) {
    console.log((r.cond ? '  ✅ ' : '  ❌ ') + r.n + (r.extra ? '  [' + r.extra + ']' : ''));
    if (r.cond) ok++;
  }
  console.log(`\n${ok}/${results.length} 通过`);
  process.exit(ok === results.length ? 0 : 1);
})();
