/**
 * 🔴 回归锁：动态发布第四轮 7 项真机反馈（#312-7）
 *
 * 反馈 → 修法：
 *   1「除封面外其他相片有加压缩吗」  → 正文配图原先**没有任何自研压缩**（只靠 chooseMedia 的
 *      sizeType:['compressed']，H5 等于没有）→ 抽通用 compressImage(src,{square,max,quality})，
 *      正文图 square:false（保原比例）+ 长边 1280 + JPEG 0.85，与封面共用一套 canvas。
 *   2「发布新动态会把最后一条内容带到新页面」 → 根因：closePublish 只清开关类状态，**没清表单**，
 *      只有发布成功路径才重置 → 抽 resetForm()，打开/关闭/发布成功三处都调。
 *   3「没有看到封面的入口」 → 两处都要：①链接卡片封面提出到分区头右侧（折叠也能看到/直达）；
 *      ②新增动态自己的封面头图 cover（db 列 + INSERT/UPDATE + toDynamic + 前端入口 + 两处列表展示）。
 *   4「展开后内容很拥挤」 → 展开体整块包进 .sec-panel（浅底卡片 + 内边距 + 统一 gap）。
 *   5「照片要能点击预览，超过 3 张横向滚动」 → ≤3 张九宫格；>3 张改 scroll-view 横向滚动；
 *      点图走 uni.previewImage（仅发布弹窗，列表页不动）。
 *   6「点了定时发布后页面滚不动，变成滚动弹窗后面的页面」 → 滚动穿透：mask 拦 touchmove，
 *      sheet 再 .stop 截断（否则 sheet-body 的滚动冒泡到 mask 被一起 preventDefault，弹窗内也滚不动）。
 *   7「名片详情里点动态只显示一张（实际 4 张）；图片底下两个 0 是什么」 → 原来写死 images[0]；
 *      改「重叠堆叠 + 剩余 +N 角标」；两个 0 是 likeCount/commentCount 计数（不是漏东西）。
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
const detail = () => stripComments(read('./cardDetail.vue'));
const detailCss = () => read('./cardDetail.vue');
const cardRoute = () => stripComments(read('../../../../server/src/routes/card.js'));
const dbSrc = () => stripComments(read('../../../../server/src/db.js'));

describe('① 正文配图也要压缩（封面之外的图不能原图直传）', () => {
  test('compressImage 是统一入口，square/max/quality 三个参数可选', () => {
    const s = dyn();
    expect(s).toMatch(/async function compressImage\(src, \{ square = true, max = COVER_MAX, quality = COVER_QUALITY \} = \{\}\)/);
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

  test('方形裁切只在方形场景生效（封面方裁，正文整图）', () => {
    const s = dyn();
    // 取源区：方形用 min(w,h) 中心裁，非方形取整图
    expect(s).toMatch(/const sw = square \? Math\.min\(w, h\) : w;/);
    expect(s).toMatch(/const sh = square \? Math\.min\(w, h\) : h;/);
    // 按长边等比缩放（不是写死正方形）
    expect(s).toMatch(/const scale = Math\.min\(1, max \/ Math\.max\(sw, sh\)\);/);
  });

  test('compressCover 仍保留（链接卡片封面的方形语义，与正文图区分）', () => {
    const s = dyn();
    expect(s).toMatch(/async function compressCover\(src\) \{[\s\S]*?return compressImage\(src, \{ square: true, max: COVER_MAX, quality: COVER_QUALITY \}\);/);
  });
});

describe('② 表单残留：发布新动态不能带上一条的内容', () => {
  test('resetForm 统一重置，且清空的是完整空壳（含 content/title/cover/images/link/ref）', () => {
    const s = dyn();
    expect(s).toMatch(/function emptyDynamic\(\) \{\s*return \{ content: '', title: '', cover: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '', title: '', desc: '', img: '' \}, ref: null \};\s*\}/);
    expect(s).toMatch(/function resetForm\(\) \{[\s\S]*?newDynamic\.value = emptyDynamic\(\);/);
  });

  test('「打开 / 关闭 / 发布成功」三处都调 resetForm（缺一就会出现残留）', () => {
    const s = dyn();
    expect(s).toMatch(/function openPublish\(\) \{\s*if \(!ensureLogin\(\)\) return;\s*resetForm\(\);\s*showPublish\.value = true;/);
    expect(s).toMatch(/function closePublish\(\) \{\s*showPublish\.value = false;\s*resetForm\(\);\s*\}/);
    expect(s).toMatch(/resetForm\(\);\s*const res = await cardApi\.getDynamics\(\);/);
  });

  test('不再有第二套内联重置（两套重置必漂移）', () => {
    const s = dyn();
    expect(s).not.toMatch(/newDynamic\.value = \{ content: '', title: ''/);
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

describe('③ 封面入口：链接卡片封面好找 + 动态自己的封面头图', () => {
  test('链接分区头右侧就有封面入口（不用展开也能看到/直达）', () => {
    const s = dyn();
    // 有封面 → 缩略图；无封面 → 「＋封面」按钮。两者都要 @click.stop（否则顺带切换展开态）
    expect(s).toMatch(/<image v-if="newDynamic\.link\.img" :src="newDynamic\.link\.img" class="sec-thumb" mode="aspectFill" @click\.stop="pickCover"\/>/);
    expect(s).toMatch(/<text v-else class="sec-added" @click\.stop="pickCover">＋封面<\/text>/);
  });

  test('动态自己的封面：表单有入口 + 上传走不裁方形的压缩 + 提交带 cover', () => {
    const s = dyn();
    expect(s).toMatch(/<view class="cover-add" v-else @click="pickDynCover">/);
    expect(s).toMatch(/async function pickDynCover\(\)/);
    expect(s).toMatch(/await compressImage\(path, \{ square: false, max: CONTENT_MAX, quality: CONTENT_QUALITY \}\)/);
    expect(s).toMatch(/newDynamic\.value\.cover = absUrl\(data\.url\)/);
    expect(s).toMatch(/cover: newDynamic\.value\.cover \|\| '',/);
  });

  test('编辑回填要带回 cover（否则编辑一次封面就丢了）', () => {
    const s = dyn();
    expect(s).toMatch(/cover: d\.cover \|\| '',/);
  });

  test('服务端：db 迁移加 cover 列', () => {
    const s = dbSrc();
    expect(s).toMatch(/if \(!colExists\(db, 'card_dynamic', 'cover'\)\) \{\s*db\.exec\("ALTER TABLE card_dynamic ADD COLUMN cover TEXT NOT NULL DEFAULT ''"\);/);
  });

  test('服务端：POST 解构 cover + INSERT 写 cover + PUT 写 cover', () => {
    const s = cardRoute();
    expect(s).toMatch(/const \{ content, images, visibility, title, cardId, cover: coverRaw,/);
    expect(s).toMatch(/const normCover = typeof coverRaw === 'string' \? coverRaw\.trim\(\)\.slice\(0, 500\) : '';/);
    expect(s).toMatch(/INSERT INTO card_dynamic \(user_id, card_id, title, content, cover, images,/);
    expect(s).toMatch(/UPDATE card_dynamic SET title=\?, content=\?, cover=\?, images=\?,/);
  });

  test('服务端：toDynamic 序列化出口下发 cover（缺这项前端永远读不到）', () => {
    const s = cardRoute();
    expect(s).toMatch(/cover: \(row\.cover \|\| ''\)\.toString\(\),/);
  });

  test('两处列表都展示封面（我的动态 / 名片详情），有封面时不重复铺配图', () => {
    const d = dyn();
    expect(d).toMatch(/<image v-if="d\.cover" class="dynamic-cover" :src="d\.cover" mode="aspectFill" @click="previewList\(d\)"\/>/);
    expect(d).toMatch(/<view class="dynamic-images" v-if="!d\.cover && d\.images\?\.length">/);
    const c = detail();
    expect(c).toMatch(/<view v-if="d\.cover \|\| \(d\.images && d\.images\.length\)" class="dyn-stack" @click="previewDyn\(d\)">/);
    expect(c).toMatch(/<view v-if="d\.cover" class="stack-single">/);
  });

  test('列表水合 cover（/uploads/ 相对路径在 MP 会空白）', () => {
    const d = dyn();
    expect(d).toMatch(/if \(d\.cover\) out\.cover = absUrl\(d\.cover\);/);
    const c = detail();
    expect(c).toMatch(/cover: x\.cover \? absUrl\(x\.cover\) : '',/);
    expect(c).toMatch(/const absUrl = \(u\) => \(typeof u === 'string' && u\.startsWith\('\/'\) \? API_HOST \+ u : u\);/);
  });
});

describe('④ 分区展开不再拥挤：展开体包进 sec-panel', () => {
  test('链接 / 引用两个分区的展开体都套了 sec-panel', () => {
    const s = dyn();
    const panels = s.match(/<view class="sec-panel">/g) || [];
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
    const s = dyn();
    expect(s).toMatch(/<view class="img-del" @click\.stop="removeImage\(i\)">✕<\/view>/);
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

  test('sheet-body 仍是可滚动区（限高 + min-height:0 + overflow-y:auto）', () => {
    const c = dynCss();
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?min-height: 0;/);
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?overflow-y: auto;/);
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?max-height: 92vh;/);
  });
});

describe('⑦ 名片详情多图：重叠堆叠 + 剩余角标（不再只显示一张）', () => {
  test('不再写死 images[0]', () => {
    const c = detail();
    expect(c).not.toMatch(/:src="d\.images\[0\]"/);
  });

  test('堆叠：最多 3 层 + stackStyle 纯百分比定位（MP 对 calc/rpx 混算支持不稳）', () => {
    const c = detail();
    expect(c).toMatch(/const STACK_MAX = 3;/);
    expect(c).toMatch(/\(d\.images \|\| \[\]\)\.slice\(0, STACK_MAX\)/);
    expect(c).toMatch(/function stackStyle\(k, total\)/);
    expect(c).toMatch(/left: `\$\{k \* 4\}%`/);
    expect(c).toMatch(/zIndex: n - k/);
  });

  test('剩余角标 +N：超过 3 张才出现；有封面时封面已铺满，配图全算未露出', () => {
    const c = detail();
    expect(c).toMatch(/<view v-if="stackRest\(d\) > 0" class="stack-more">\+\{\{ stackRest\(d\) \}\}<\/view>/);
    expect(c).toMatch(/function stackRest\(d\) \{[\s\S]*?if \(d\.cover\) return \(d\.images \|\| \[\]\)\.length;/);
    expect(c).toMatch(/return Math\.max\(0, total - STACK_MAX\)/);
  });

  test('容器必须定高（绝对定位子层不撑高父容器，没高度会塌成 0）', () => {
    const c = detailCss();
    expect(c).toMatch(/\.dyn-stack \{[\s\S]*?position: relative;/);
    expect(c).toMatch(/\.dyn-stack \{[\s\S]*?height: 320rpx;/);
    expect(c).toMatch(/\.stack-item \{[\s\S]*?position: absolute;/);
  });

  test('点堆叠区预览全部（封面排第一，与展示顺序一致）', () => {
    const c = detail();
    expect(c).toMatch(/const urls = d\.cover \? \[d\.cover, \.\.\.imgs\] : imgs;/);
    expect(c).toMatch(/uni\.previewImage\(\{ urls \}\)/);
  });

  test('「两个 0」是点赞数/评论数计数，不是缺东西（钉死其存在与含义）', () => {
    const c = detail();
    expect(c).toMatch(/\{\{ d\.likeCount \|\| 0 \}\}/);
    expect(c).toMatch(/\{\{ d\.commentCount \|\| 0 \}\}/);
    expect(c).toMatch(/<SIcon name="like" size="small"/);
    expect(c).toMatch(/<SIcon name="comment" size="small"/);
  });
});
