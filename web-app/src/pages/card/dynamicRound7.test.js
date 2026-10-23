/**
 * 🔴 回归锁：动态发布第四轮（#312-7）**仍然有效**的钉子
 *
 * ⚠️ #312-8（第五轮）已下线的东西不在这里钉，改由 dynamicSheet.test.js 的
 *    「📌 回归护栏：封面链路已整体下线」守住（防止有人把已删功能加回来）：
 *    - 动态封面头图 cover（db 列 / 接口 / 前端入口）→ 用户裁决「直接去掉」
 *    - 链接卡片的标题 / 描述 / 封面上传 → 精简掉（卡片标题改跟随动态标题）
 *
 * 本文件保留的 #312-7 修法：
 *   1 正文配图压缩（封面之外的图不能原图直传）
 *   2 表单残留（发布新动态不能带上一条内容）
 *   4 分区展开拥挤（sec-panel）
 *   5 已选图点击预览 + >3 张横向滚动
 *   6 滚动穿透（mask 拦 + sheet 截断，必须成对）
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const dyn = () => stripComments(read('./dynamic.vue'));
const dynCss = () => read('./dynamic.vue');
const cardRoute = () => stripComments(read('../../../../server/src/routes/card.js'));
const dbSrc = () => stripComments(read('../../../../server/src/db.js'));

describe('① 正文配图也要压缩（不能原图直传）', () => {
  test('compressImage 统一入口，默认保原比例 + 长边 1280', () => {
    const s = dyn();
    expect(s).toMatch(/async function compressImage\(src, \{ square = false, max = CONTENT_MAX, quality = CONTENT_QUALITY \} = \{\}\)/);
    expect(s).toMatch(/const CONTENT_MAX = 1280;/);
    expect(s).toMatch(/const CONTENT_QUALITY = 0\.85;/);
  });

  test('pickImages 上传前先过 compressImage（保原比例 + 长边 1280）', () => {
    const s = dyn();
    expect(s).toMatch(/const out = await compressImage\(p, \{ square: false, max: CONTENT_MAX, quality: CONTENT_QUALITY \}\)/);
    // 压缩失败不能阻塞发布（原图直传兜底），所以必须包在 try 里
    expect(s).toMatch(/try \{[\s\S]{0,300}?await compressImage\(p, \{ square: false[\s\S]{0,200}?\} catch \{/);
    expect(s).toMatch(/await cardApi\.uploadDynamicImage\(upPath, upFile\)/);
  });

  test('方形裁切只在 square=true 时生效（默认整图，按长边等比缩放）', () => {
    const s = dyn();
    expect(s).toMatch(/const sw = square \? Math\.min\(w, h\) : w;/);
    expect(s).toMatch(/const sh = square \? Math\.min\(w, h\) : h;/);
    expect(s).toMatch(/const scale = Math\.min\(1, max \/ Math\.max\(sw, sh\)\);/);
  });
});

describe('② 表单残留：发布新动态不能带上一条的内容', () => {
  test('resetForm 统一重置，清空的是完整空壳（content/title/images/link/ref）', () => {
    const s = dyn();
    expect(s).toMatch(/function emptyDynamic\(\) \{\s*return \{ content: '', title: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '' \}, ref: null \};\s*\}/);
    expect(s).toMatch(/function resetForm\(\) \{[\s\S]*?newDynamic\.value = emptyDynamic\(\);/);
  });

  test('「打开 / 关闭 / 发布成功」三处都调 resetForm（缺一就会出现残留）', () => {
    const s = dyn();
    // 🔴 #312-10：openPublish 里多了 sheetScrollTop 归零（scroll-view 回顶），
    //    断言按语义钉「resetForm 在 showPublish=true 之前」，不逐字钉函数体
    expect(s).toMatch(/function openPublish\(\) \{\s*if \(!ensureLogin\(\)\) return;\s*resetForm\(\);/);
    expect(s).toMatch(/showPublish\.value = true;/);
    expect(s).toMatch(/function closePublish\(\) \{\s*showPublish\.value = false;\s*resetForm\(\);/);
    expect(s).toMatch(/resetForm\(\);\s*const res = await cardApi\.getDynamics\(\);/);
  });

  test('不再有第二套内联重置（两套重置必漂移）', () => {
    expect(dyn()).not.toMatch(/newDynamic\.value = \{ content: '', title: ''/);
  });

  test('resetForm 顺带清编辑态/定时/收缩态/引用选择器', () => {
    const s = dyn();
    const body = (s.match(/function resetForm\(\) \{([\s\S]*?)\n\}/) || [])[1] || '';
    expect(body).toMatch(/editingId\.value = null;/);
    expect(body).toMatch(/schedEnabled\.value = false;/);
    expect(body).toMatch(/schedDate\.value = '';/);
    expect(body).toMatch(/schedTime\.value = '';/);
    expect(body).toMatch(/linkOpen\.value = false;/);
    expect(body).toMatch(/refOpen\.value = false;/);
    expect(body).toMatch(/showRefPicker\.value = false;/);
  });
});

describe('④ 分区展开不再拥挤：展开体包进 sec-panel', () => {
  test('链接 / 引用两个分区的展开体都套了 sec-panel', () => {
    const panels = dyn().match(/<view class="sec-panel">/g) || [];
    expect(panels.length).toBeGreaterThanOrEqual(2);
  });

  test('sec-panel 有内边距 + 与分区头的间距 + 纵向统一 gap', () => {
    const c = dynCss();
    expect(c).toMatch(/\.sec-panel \{[\s\S]*?margin-top: 20rpx;/);
    expect(c).toMatch(/\.sec-panel \{[\s\S]*?padding: 24rpx;/);
    expect(c).toMatch(/\.sec-panel \{[\s\S]*?gap: 16rpx;/);
  });
});

describe('⑤ 已选图：点击预览 + 超过 3 张横向滚动', () => {
  test('阈值常量存在，≤3 张九宫格 / >3 张横向 scroll-view', () => {
    const s = dyn();
    expect(s).toMatch(/const IMG_SCROLL_THRESHOLD = 3;/);
    expect(s).toMatch(/<view class="img-grid" v-if="newDynamic\.images\.length && newDynamic\.images\.length <= IMG_SCROLL_THRESHOLD">/);
    expect(s).toMatch(/<scroll-view scroll-x class="img-scroll" v-else-if="newDynamic\.images\.length"/);
  });

  test('横向滚动内层用 inline-flex（scroll-view 内 flex 会折行）+ 定宽子项', () => {
    const c = dynCss();
    expect(c).toMatch(/\.img-scroll-inner \{[\s\S]*?display: inline-flex;/);
    expect(c).toMatch(/\.img-cell-fixed \{[\s\S]*?width: 200rpx;/);
    expect(c).toMatch(/\.img-scroll \{[\s\S]*?white-space: nowrap;/);
  });

  test('两种排布的图都能点开预览（previewPicked 传全量 urls + current）', () => {
    const s = dyn();
    expect(s).toMatch(/@click="previewPicked\(i\)"/);
    expect(s).toMatch(/function previewPicked\(i\) \{[\s\S]*?uni\.previewImage\(\{ urls, current: urls\[i\] \|\| urls\[0\] \}\);/);
  });

  test('删除按钮仍然 @click.stop（不能因为加了预览就误触预览）', () => {
    expect(dyn()).toMatch(/<view class="img-del" @click\.stop="removeImage\(i\)">✕<\/view>/);
  });
});

describe('⑥ 滚动穿透：弹窗打开时后面页面不能滚', () => {
  test('mask 拦 touchmove，sheet 同时 .stop 截断（成对出现才生效）', () => {
    const s = dyn();
    // 缺 sheet 的 .stop → sheet-body 的滚动会冒泡到 mask 一起被 preventDefault，弹窗内也滚不动
    expect(s).toMatch(/<view class="modal-mask" v-if="showPublish" @click="closePublish" @touchmove\.stop\.prevent="noopScroll">/);
    expect(s).toMatch(/<view class="bottom-sheet" @click\.stop @touchmove\.stop="noopScroll">/);
    expect(s).toMatch(/function noopScroll\(\) \{\}/);
  });

  test('sheet 仍限高（scroll-view 才有滚动区可算）', () => {
    expect(dynCss()).toMatch(/\.bottom-sheet \{[\s\S]*?max-height: 92vh;/);
  });
});

describe('📌 服务端护栏：cover 字段已随 #312-8 下线（防加回）', () => {
  test('db.js 不再有 cover 迁移', () => {
    expect(dbSrc()).not.toMatch(/ADD COLUMN cover/);
  });

  test('card.js 的 INSERT / UPDATE / toDynamic 都不再带 cover', () => {
    const s = cardRoute();
    expect(s).toMatch(/INSERT INTO card_dynamic \(user_id, card_id, title, content, images,/);
    expect(s).toMatch(/UPDATE card_dynamic SET title=\?, content=\?, images=\?,/);
    expect(s).not.toMatch(/cover: \(row\.cover/);
    expect(s).not.toMatch(/cover: coverRaw/);
  });
});
