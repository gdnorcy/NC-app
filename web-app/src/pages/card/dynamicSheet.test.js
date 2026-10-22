/**
 * 🔴 回归锁：发布弹窗体验四项反馈（2026-10-22 真机截图）
 *
 * 反馈与修法：
 *   ① 「编辑后/点发布后无法上下滚动」→ sheet 限高 + 纵向 flex，body 区 overflow-y:auto。
 *      min-height:0 是关键（flex 子项默认 min-height:auto 会被内容撑高，max-height 形同虚设）。
 *   ② 「链接和引用名片模块默认做成收缩的」→ linkOpen/refOpen 默认 false，一行头 + 箭头；
 *      编辑带回内容时 openEdit 自动展开（linkOpen = !!d.linkUrl / refOpen = !!d.ref）。
 *   ③ 「定时发布的按钮打开后的配色不对」→ switch 弃用硬编码 #165dff，改 schedSwitchColor
 *      （brandPrimary → design-primary → 兜底），绿色品牌租户下不再露蓝。
 *   ④ 「封面图要做成拍照或上传 + 裁切 + 压缩」→ 删除封面图 URL 输入框，改 pickCover：
 *      chooseMedia(album+camera) →（MP）wx.cropImage 1:1 → 中心方裁 + 限幅 720 + JPEG 0.85 → 上传。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const src = () => stripComments(read('./dynamic.vue'));
const css = () => read('./dynamic.vue');

describe('① 弹窗滚动：sheet 限高 + body 区滚动（无法上下滚动反馈）', () => {
  test('.bottom-sheet 限高且纵向 flex', () => {
    const c = css();
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?max-height: 92vh;/);
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?display: flex;/);
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?flex-direction: column;/);
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?box-sizing: border-box;/);
  });

  test('.sheet-body 可滚动且可被压缩（min-height:0 是关键，缺了 max-height 形同虚设）', () => {
    const c = css();
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?flex: 1;/);
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?min-height: 0;/);
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?overflow-y: auto;/);
  });

  test('头/尾不参与滚动（flex-shrink:0）', () => {
    const c = css();
    expect(c).toMatch(/\.sheet-header \{[\s\S]*?flex-shrink: 0;/);
    expect(c).toMatch(/\.sheet-footer \{[\s\S]*?flex-shrink: 0;/);
  });
});

describe('② 链接卡片 / 引用名片模块：默认收缩', () => {
  test('linkOpen/refOpen 默认 false', () => {
    const s = src();
    expect(s).toMatch(/const linkOpen = ref\(false\);/);
    expect(s).toMatch(/const refOpen = ref\(false\);/);
  });

  test('两个分区都是 sec-head 一行头（点击切换展开），带已添加徽标', () => {
    const s = src();
    expect(s).toMatch(/<view class="sec-head" @click="linkOpen = !linkOpen">/);
    expect(s).toMatch(/<view class="sec-head" @click="refOpen = !refOpen">/);
    expect(s).toMatch(/<text v-if="linkActive" class="sec-added">已添加<\/text>/);
    expect(s).toMatch(/<text v-if="refActive" class="sec-added">已添加<\/text>/);
    // 分区体 v-if 由 open 控制（默认收起）
    expect(s).toMatch(/<template v-if="linkOpen">/);
    expect(s).toMatch(/<template v-if="refOpen">/);
  });

  test('互斥提示保留在分区体内（图片/链接/引用三选一）', () => {
    const s = src();
    expect(s).toMatch(/<view v-if="imagesActive \|\| refActive" class="form-hint">图片与链接卡片互斥/);
    expect(s).toMatch(/<view v-if="imagesActive \|\| linkActive" class="form-hint">图片\/链接与引用互斥/);
  });

  test('编辑带回内容时自动展开（否则用户看不到已配的链接/引用）', () => {
    const s = src();
    expect(s).toMatch(/linkOpen\.value = !!d\.linkUrl;/);
    expect(s).toMatch(/refOpen\.value = !!d\.ref;/);
  });

  test('关闭/发布成功后重置收缩态', () => {
    const s = src();
    // 🔴 #312-7-2 后：三处（打开/关闭/发布成功）统一收敛到 resetForm()，
    //   源码里 linkOpen/refOpen 的清零只在 resetForm 出现一次——这是**收敛**而非漏清。
    //   所以这里改钉「resetForm 里清了 + 三个入口都调用了 resetForm」。
    expect(s).toMatch(/function resetForm\(\) \{[\s\S]*?linkOpen\.value = false;[\s\S]*?refOpen\.value = false;/);
    expect(s).toMatch(/function closePublish\(\) \{\s*showPublish\.value = false;\s*resetForm\(\);/);
    // 发布成功路径也走 resetForm（不再单独手写一遍重置）
    expect(s).toMatch(/showPublish\.value = false;[\s\S]{0,400}?resetForm\(\);/);
    // 且发布成功路径不该再残留旧的内联重置字面量（防两套重置再次漂移）
    expect(s).not.toMatch(/newDynamic\.value = \{ content: '', title: ''/);
  });
});

describe('③ 定时开关配色跟品牌走', () => {
  test('switch 用 schedSwitchColor，无硬编码 color="#165dff"', () => {
    const s = src();
    expect(s).toMatch(/<switch :checked="schedEnabled" @change="onSchedToggle" :color="schedSwitchColor" \/>/);
    expect(s).not.toMatch(/<switch[^>]*color="#165dff"/);
  });
});

describe('⑤ 分区头带「展开/收起」文字（比裸箭头直观）', () => {
  test('链接/引用分区头都有 sec-toggle 文字', () => {
    const s = src();
    expect(s).toMatch(/<text class="sec-toggle">\{\{ linkOpen \? '收起' : '展开' \}\}<\/text>/);
    expect(s).toMatch(/<text class="sec-toggle">\{\{ refOpen \? '收起' : '展开' \}\}<\/text>/);
  });
});

describe('⑥ 上传图片 URL 补全（/uploads/ 相对路径在 MP 显示空白）', () => {
  test('absUrl：相对路径按端补基址（MP 完整域名 / H5 空串保持同源）', () => {
    const s = src();
    expect(s).toMatch(/import \{ API_HOST \} from '\.\.\/\.\.\/utils\/apiBase\.js';/);
    expect(s).toMatch(/const absUrl = \(u\) => \(typeof u === 'string' && u\.startsWith\('\/'\) \? API_HOST \+ u : u\);/);
  });

  test('hydrateUrls：列表加载/编辑回填统一过一遍（配图/链接封面/引用封面）', () => {
    const s = src();
    expect(s).toMatch(/function hydrateUrls\(d\)/);
    expect(s).toMatch(/if \(Array\.isArray\(d\.images\)\) out\.images = d\.images\.map\(absUrl\);/);
    expect(s).toMatch(/if \(d\.linkImg\) out\.linkImg = absUrl\(d\.linkImg\);/);
    expect(s).toMatch(/if \(d\.ref && d\.ref\.cover\) out\.ref = \{ \.\.\.d\.ref, cover: absUrl\(d\.ref\.cover\) \};/);
    // 两处列表加载都过水合（onMounted + publish 成功后刷新）
    const hits = s.match(/dynamics\.value = \(res\.dynamics \|\| \[\]\)\.map\(hydrateUrls\);/g) || [];
    expect(hits.length).toBe(2);
  });

  test('新上传的两条链路（配图/封面）都过 absUrl', () => {
    const s = src();
    expect(s).toMatch(/newDynamic\.value\.images\.push\(absUrl\(data\.url\)\);/);
    expect(s).toMatch(/if \(data && data\.url\) newDynamic\.value\.link\.img = absUrl\(data\.url\);/);
  });
});

describe('⑦ 登录守卫：未登录不进发布/编辑页（反馈：没验证是否已登录）', () => {
  test('ensureLogin：hasCardToken + toast + reLaunch 登录页（mall 同款范式）', () => {
    const s = src();
    expect(s).toMatch(/import \{ cardApi, hasCardToken \} from '\.\.\/\.\.\/utils\/cardApi\.js';/);
    expect(s).toMatch(/function ensureLogin\(\) \{/);
    expect(s).toMatch(/if \(hasCardToken\(\)\) return true;/);
    expect(s).toMatch(/uni\.reLaunch\(\{ url: '\/pages\/card\/login' \}\);/);
  });

  test('发布入口走 openPublish（先守卫再开弹窗），不再直接置 showPublish', () => {
    const s = src();
    // 🔴 #312-7-2：开弹窗前先 resetForm()（否则上一条动态会被带进新页面）
    expect(s).toMatch(/function openPublish\(\) \{\s*if \(!ensureLogin\(\)\) return;\s*resetForm\(\);\s*showPublish\.value = true;/);
    expect(s).toMatch(/<view class="publish-btn" @click="openPublish">\+ 发布<\/view>/);
    expect(s).not.toMatch(/class="publish-btn" @click="showPublish = true"/);
  });

  test('openEdit 与页面进入（onShow/onMounted）都有守卫', () => {
    const s = src();
    expect(s).toMatch(/function openEdit\(d\) \{\s*if \(!ensureLogin\(\)\) return;/);
    expect(s).toMatch(/onShow\(\(\) => \{[\s\S]*?if \(!hasCardToken\(\)\) ensureLogin\(\);/);
    expect(s).toMatch(/onMounted\(async \(\) => \{\s*if \(!ensureLogin\(\)\) return;/);
  });
});

describe('④ 封面图：拍照/上传 + 裁切 + 压缩（不再手填 URL）', () => {
  test('封面图 URL 输入框已删除（v-model link.img 不再出现在 input 上）', () => {
    const s = src();
    expect(s).not.toMatch(/<input[^>]*v-model="newDynamic\.link\.img"/);
    expect(s).not.toMatch(/封面图 URL/);
  });

  test('封面选择器：预览 + 删除 + 拍照/上传入口', () => {
    const s = src();
    expect(s).toMatch(/<view class="cover-add" v-else @click="pickCover">/);
    expect(s).toMatch(/<view class="cover-del" @click="newDynamic\.link\.img = \'\'">✕<\/view>/);
    expect(s).toMatch(/<image :src="newDynamic\.link\.img" mode="aspectFill" class="cover-img" \/>/);
  });

  test('pickCover：chooseMedia（album+camera）→ 裁切 → 压缩 → 上传', () => {
    const s = src();
    expect(s).toMatch(/async function pickCover\(\)/);
    expect(s).toMatch(/sourceType: \['album', 'camera'\]/);
    expect(s).toMatch(/path = await cropCoverSquare\(path\);/);
    expect(s).toMatch(/const out = await compressCover\(path\);/);
    expect(s).toMatch(/await cardApi\.uploadDynamicImage\(out\.path, out\.file\)/);
    expect(s).toMatch(/newDynamic\.value\.link\.img = absUrl\(data\.url\)/);
  });

  test('MP 走 wx.cropImage 1:1 系统裁切（取消/低版本回原图，canvas 中心裁兜底）', () => {
    const s = src();
    expect(s).toMatch(/function cropCoverSquare\(src\)/);
    expect(s).toMatch(/wx\.cropImage\(\{/);
    expect(s).toMatch(/cropScale: '1:1'/);
  });

  test('compressCover：中心方裁 + 限幅 + JPEG，MP 屏幕外 canvas / H5 脱离文档 canvas', () => {
    const s = src();
    expect(s).toMatch(/const COVER_MAX = 720;/);
    expect(s).toMatch(/const COVER_QUALITY = 0\.85;/);
    expect(s).toMatch(/async function compressCover\(src\)/);
    expect(s).toMatch(/#coverCompressCanvas/);
    // 🔴 #312-7-1：压缩逻辑抽成通用 compressImage(src,{square,max,quality})，
    //   compressCover 只是「square:true + COVER_MAX + COVER_QUALITY」的语义包装。
    expect(s).toMatch(/async function compressImage\(src, \{ square = true, max = COVER_MAX, quality = COVER_QUALITY \} = \{\}\)/);
    expect(s).toMatch(/return compressImage\(src, \{ square: true, max: COVER_MAX, quality: COVER_QUALITY \}\)/);
    expect(s).toMatch(/fileType: 'jpg', quality,/);
    expect(s).toMatch(/cv\.toBlob\(resolve, 'image\/jpeg', quality\)/);
    expect(s).toMatch(/const COVER_MAX = 720;/);
    // 屏幕外 canvas 禁 display:none（MP 节点查不到）→ fixed 移出屏幕
    expect(css()).toMatch(/\.offscreen-canvas \{[\s\S]*?position: fixed;/);
    expect(css()).toMatch(/\.offscreen-canvas \{[\s\S]*?left: -9999px;/);
    expect(css()).not.toMatch(/\.offscreen-canvas \{[\s\S]*?display: none/);
  });
});
