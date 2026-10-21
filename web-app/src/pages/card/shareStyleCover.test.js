/**
 * 个性化分享页两处实测反馈回归锁（🔴 #328，2026-10-22）
 *
 * 反馈 1「分享的卡片预览比例不对」：
 *   预览 canvas 的 CSS 尺寸原来直接绑设计稿像素 `width: SHARE_COVER_W+'px'`（=750px）。
 *   375 屏上：宽被容器 overflow:hidden 裁掉、高 600px 全保留 → 实际显示 ≈302×600（1:2），
 *   而微信转发图硬约束是 **5:4**。位图本来就是 750×600（renderShareCover 画的对），
 *   错的是**显示尺寸**没按容器缩放。
 *
 * 反馈 2「横向向左滑动时，只有底部的文字会动，上面的图不会动」：
 *   6 张缩略图是 canvas type=2d（原生组件），放在横向 scroll-view 里同层渲染一旦失效，
 *   滑动时普通节点（文字）跟手、canvas 钉在屏幕上不动。
 *   正解：画到屏幕外导出 canvas → 导出临时图片 → `<image>` 展示（普通节点，必跟手）。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
/** 剥注释再断言 —— 源码说明注释里含同字面量会造成「旧实现已移除」类断言假失败 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const page = () => stripComments(read('./shareStyle.vue'));
const exportSrc = () => stripComments(read('./shareCoverExport.js'));

describe('🔴 #328 预览画布显示尺寸必须按容器缩放（5:4）', () => {
  test('canvas :style 用 previewW/previewH，禁直接绑设计稿常量', () => {
    const s = page();
    expect(s).toMatch(/:style="previewW \? \{ width: previewW \+ 'px', height: previewH \+ 'px' \} : null"/);
    // 旧病根字面量不许回来
    expect(s).not.toMatch(/width: coverW \+ 'px'/);
    expect(s).not.toMatch(/width: SHARE_COVER_W \+ 'px'/);
  });

  test('previewH 必须由 previewW × SHARE_COVER_H / SHARE_COVER_W 推出（比例锁死 5:4）', () => {
    const s = page();
    expect(s).toMatch(/previewW\.value \* SHARE_COVER_H\) \/ SHARE_COVER_W/);
  });

  test('绘制仍用设计稿尺寸（位图清晰度不变），显示与绘制是两套值', () => {
    const s = page();
    expect(s).toMatch(/W: coverW, H: coverH/);
    expect(s).toMatch(/const coverW = SHARE_COVER_W/);
  });

  test('初值由屏宽推算、再实测校正（不许恒 0 / 不许只靠推算）', () => {
    const s = page();
    expect(s).toMatch(/function initPreviewW\(\)/);
    expect(s).toMatch(/queryNode\('\.ps-wxcard-cover'\)/);
    expect(s).toMatch(/previewW\.value = Math\.round\(box\.width\)/);
  });
});

describe('🔴 #328 缩略图必须用 <image>（canvas 在横向 scroll-view 里不跟手）', () => {
  test('thumbSrc 有值渲染 <image>，canvas 只能是 v-else 兜底分支', () => {
    const s = page();
    expect(s).toMatch(/v-if="thumbSrc\[s\.key\]"/);
    expect(s).toMatch(/<image\s+v-if="thumbSrc\[s\.key\]"/);
    // 兜底 canvas 必须挂在 v-else 上（导出失败才出现）
    expect(s).toMatch(/v-else\s+:id="'coverThumb'/);
  });

  test('主路径走屏幕外导出 canvas + exportShareCover，失败才退回直绘', () => {
    const s = page();
    expect(s).toMatch(/import \{ exportShareCover \} from '\.\/shareCoverExport\.js'/);
    expect(s).toMatch(/queryNode\('#coverExportCanvas'\)/);
    expect(s).toMatch(/await exportShareCover\(node\.node/);
    expect(s).toMatch(/await drawThumbMP\(s\.key, colors\)/);   // 兜底路径仍在
  });

  test('导出画布禁 display:none（MP 节点查不到）→ fixed + 负偏移', () => {
    const s = page();
    expect(s).toMatch(/\.ps-export-canvas\s*\{[^}]*position: fixed; left: -9999px/);
    expect(s).not.toMatch(/\.ps-export-canvas\s*\{[^}]*display:\s*none/);
    expect(s).toMatch(/id="coverExportCanvas"/);
  });

  test('exportShareCover 支持传 dpr（缩略图 1 够用，正图保持 2）', () => {
    const s = exportSrc();
    expect(s).toMatch(/dpr: opts\.dpr \|\| 2/);
    const page2 = page();
    expect(page2).toMatch(/dpr: 1,\s*\n\s*\}\);/);   // 缩略图导出用 dpr:1
  });
});
