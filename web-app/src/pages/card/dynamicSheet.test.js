/**
 * 🔴 回归锁：发布弹窗体验四项反馈（2026-10-22 真机截图）
 *
 * 反馈与修法：
 *   ① 「编辑后/点发布后无法上下滚动」→ sheet 限高 + body 区改 scroll-view scroll-y，
 *      并用 max-height 显式封顶（MP scroll-view 需确定高度才滚动；flex:1+min-height:0
 *      在 H5 有效、MP 端分配不到高度——cardEdit.vue 有同款真机实证）。
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
  test('.bottom-sheet 限高且**不用 flex**（flex 子项的 max-height 与 scroll-view 真机交互异常，见 #312-10）', () => {
    const c = css();
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?max-height: 92vh;/);
    expect(c).toMatch(/\.bottom-sheet \{[\s\S]*?box-sizing: border-box;/);
    // 块级堆叠：不得再用 flex column（曾因 flex 分配导致展开后可视位置停在半中段）
    // 注意 [^}]* 锁死在本条规则的花括号内——[\s\S]*? 会串到 .sheet-header 的 display:flex 误报
    expect(c).not.toMatch(/\.bottom-sheet \{[^}]*display: flex;/);
    expect(c).not.toMatch(/\.bottom-sheet \{[^}]*flex-direction: column;/);
  });

  test('.sheet-body 是 scroll-view 且显式定高（🔴 #312-8：普通 view 的 overflow-y:auto 在 MP 滚不动；flex:1+height:0 分配高度在 MP 端也不生效）', () => {
    const s = src();
    // 必须是 scroll-view scroll-y，不靠 CSS 的 overflow-y（:scroll-top 属性不影响这条匹配）
    expect(s).toMatch(/<scroll-view scroll-y class="sheet-body"/);
    const c = css();
    // MP 的 scroll-view 必须有确定高度才滚动。三条路都试过：
    //   ① 普通 view + overflow-y:auto —— 真机不滚；
    //   ② flex:1 + height:0 + min-height:0 指望父级 max-height 分配 —— MP 端分配不生效，
    //      scroll-view 被内容撑高、压住 footer、滚不动（cardEdit.vue ce-modal-body 同款实证）；
    //   ③ max-height 直接给滚动区封顶（tl-scroll/rules-scroll 同款，真机验证过）。
    expect(c).toMatch(/\.sheet-body \{[^}]*max-height: 62vh;/);
    // 反向钉死：不得回到已被真机证伪的 flex 分配高度写法（[^}]* 锁在花括号内，防串到后续规则）
    expect(c).not.toMatch(/\.sheet-body \{[^}]*flex: 1;/);
    expect(c).not.toMatch(/\.sheet-body \{[^}]*height: 0;/);
    // 也不得退回 overflow-y:auto
    expect(c).not.toMatch(/\.sheet-body \{[^}]*overflow-y: auto;/);
  });

  test('🔴 #312-10：内容增高后 scroll-view 回顶（否则展开引用/定时后可视位置停在半中段，像被挡住）', () => {
    const s = src();
    // scroll-view 绑 scroll-top，值 0/0.1 交替强制变化（MP 端只在值变化时生效）
    expect(s).toMatch(/<scroll-view scroll-y class="sheet-body" :scroll-top="sheetScrollTop">/);
    expect(s).toMatch(/const sheetScrollTop = ref\(0\);/);
    expect(s).toMatch(/function resetSheetScroll\(\) \{\s*sheetScrollTop\.value = sheetScrollTop\.value === 0 \? 0\.1 : 0;\s*\}/);
    // 分区展开 / 定时开关都要回顶（post：等 DOM 更新后再滚）
    expect(s).toMatch(/watch\(\[linkOpen, refOpen, schedEnabled\], resetSheetScroll, \{ flush: 'post' \}\);/);
    // 开/关弹窗时归位（关闭时置 0，下次打开从顶部开始）
    expect(s).toMatch(/sheetScrollTop\.value = 0;\s*\n\s*showPublish\.value = true;/);
    expect(s).toMatch(/resetForm\(\);\s*\n\s*sheetScrollTop\.value = 0;/);
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
    // absUrl 收敛到 utils/apiBase.js 单一实现（曾每页各写一份 → 漂移），页面只 import
    expect(s).toMatch(/import \{ absUrl \} from '\.\.\/\.\.\/utils\/apiBase\.js';/);
    const apiBase = stripComments(read('../../utils/apiBase.js'));
    expect(apiBase).toMatch(/export const absUrl = \(u\) => \(typeof u === 'string' && u\.startsWith\('\/'\) \? API_HOST \+ u : u\);/);
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

  test('新上传的配图过 absUrl（封面链路 #312-8 已下线，只剩配图一条）', () => {
    const s = src();
    expect(s).toMatch(/newDynamic\.value\.images\.push\(absUrl\(data\.url\)\);/);
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
    // 🔴 #312-10：resetForm 后多了一步 sheetScrollTop 归零，断言按语义不逐字
    expect(s).toMatch(/function openPublish\(\) \{\s*if \(!ensureLogin\(\)\) return;\s*resetForm\(\);/);
    expect(s).toMatch(/sheetScrollTop\.value = 0;\s*\n\s*showPublish\.value = true;/);
    // 🔴 #312-8-3：入口从导航栏（被微信胶囊挤到标题左边）改到右下角悬浮圆按钮
    expect(s).toMatch(/<view class="fab-publish" @click="openPublish">＋<\/view>/);
    expect(s).not.toMatch(/class="publish-btn"/);
  });

  test('openEdit 与页面进入（onShow/onMounted）都有守卫', () => {
    const s = src();
    expect(s).toMatch(/function openEdit\(d\) \{\s*if \(!ensureLogin\(\)\) return;/);
    expect(s).toMatch(/onShow\(\(\) => \{[\s\S]*?if \(!hasCardToken\(\)\) ensureLogin\(\);/);
    expect(s).toMatch(/onMounted\(async \(\) => \{\s*if \(!ensureLogin\(\)\) return;/);
  });
});

describe('④ 配图压缩（不再手填 URL；#312-8 下线封面链路后只剩这一条）', () => {
  test('配图压缩：compressImage 统一入口，默认保原比例 + 长边 1280', () => {
    const s = src();
    expect(s).toMatch(/const CONTENT_MAX = 1280;/);
    expect(s).toMatch(/const CONTENT_QUALITY = 0\.85;/);
    expect(s).toMatch(/async function compressImage\(src, \{ square = false, max = CONTENT_MAX, quality = CONTENT_QUALITY \} = \{\}\)/);
    expect(s).toMatch(/fileType: 'jpg', quality,/);
    expect(s).toMatch(/cv\.toBlob\(resolve, 'image\/jpeg', quality\)/);
  });

  test('屏幕外 canvas 禁 display:none（MP 节点查不到）→ fixed 移出屏幕', () => {
    expect(src()).toMatch(/#coverCompressCanvas/);
    expect(css()).toMatch(/\.offscreen-canvas \{[\s\S]*?position: fixed;/);
    expect(css()).toMatch(/\.offscreen-canvas \{[\s\S]*?left: -9999px;/);
    expect(css()).not.toMatch(/\.offscreen-canvas \{[\s\S]*?display: none/);
  });

  test('📌 回归护栏：封面链路已整体下线（pickCover / cropCoverSquare / compressCover 都不应存在）', () => {
    const s = src();
    expect(s).not.toMatch(/function pickCover/);
    expect(s).not.toMatch(/function cropCoverSquare/);
    expect(s).not.toMatch(/function compressCover/);
    expect(s).not.toMatch(/wx\.cropImage/);
    expect(s).not.toMatch(/动态封面/);
    expect(s).not.toMatch(/＋封面/);
    // 链接卡片不再有标题/描述/封面输入（#312-8 精简）
    expect(s).not.toMatch(/v-model="newDynamic\.link\.title"/);
    expect(s).not.toMatch(/v-model="newDynamic\.link\.desc"/);
  });
});
