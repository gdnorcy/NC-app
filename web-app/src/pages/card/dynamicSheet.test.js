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
    // closePublish 与 publish 成功路径各清一次（源码出现两处）
    const hits = s.match(/linkOpen\.value = false;/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const hits2 = s.match(/refOpen\.value = false;/g) || [];
    expect(hits2.length).toBeGreaterThanOrEqual(2);
  });
});

describe('③ 定时开关配色跟品牌走', () => {
  test('switch 用 schedSwitchColor，无硬编码 color="#165dff"', () => {
    const s = src();
    expect(s).toMatch(/<switch :checked="schedEnabled" @change="onSchedToggle" :color="schedSwitchColor" \/>/);
    expect(s).not.toMatch(/<switch[^>]*color="#165dff"/);
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
    expect(s).toMatch(/newDynamic\.value\.link\.img = data\.url/);
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
    expect(s).toMatch(/fileType: 'jpg', quality: COVER_QUALITY/);
    expect(s).toMatch(/cv\.toBlob\(resolve, 'image\/jpeg', COVER_QUALITY\)/);
    // 屏幕外 canvas 禁 display:none（MP 节点查不到）→ fixed 移出屏幕
    expect(css()).toMatch(/\.offscreen-canvas \{[\s\S]*?position: fixed;/);
    expect(css()).toMatch(/\.offscreen-canvas \{[\s\S]*?left: -9999px;/);
    expect(css()).not.toMatch(/\.offscreen-canvas \{[\s\S]*?display: none/);
  });
});
