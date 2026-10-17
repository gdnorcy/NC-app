import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 编辑名片页头部布局回归（2026-10-21 真机报修「标题栏和返回键似乎换行了」）：
// step 皮肤 .header 的 56rpx padding-top 是旧版扁平 .page-bar（无状态栏占位）时代的呼吸感；
// 2b85bd1 统一沉浸式导航换成 PageNav（自带 statusBarHeight 占位）后未重新对齐，
// 44px 状态栏占位 + 28px 额外 padding 叠加 → 导航条整体低于胶囊行约 28px，
// 返回键+标题独立成行（观感「换行」）且与大标题重复。
// 修复：额外间距只作用于标题区 .row1，导航条与胶囊行对齐。
const here = import.meta.url;
const SRC = readFileSync(fileURLToPath(new URL('./create.vue', here)), 'utf8');

describe('create.vue step 皮肤头部：导航条不得被额外 padding 推离胶囊行', () => {
  test('.header 本体不再有 padding-top（导航条对齐胶囊行）', () => {
    // .header 规则只允许左右下内边距
    const headerRule = SRC.match(/\.header\s*\{[^}]*\}/);
    expect(headerRule).toBeTruthy();
    expect(headerRule[0]).not.toMatch(/padding-top/);
  });

  test('额外间距改挂 .row1（只推标题区，不推导航条）', () => {
    expect(SRC).toContain('.skin-step .row1 { padding-top: 56rpx; }');
    expect(SRC).not.toContain('.skin-step .header { padding-top');
  });

  test('PageNav 仍在 header 内且 transparent 沉浸式', () => {
    expect(SRC).toContain('<view class="header-nav">');
    expect(SRC).toContain('back bg="transparent"');
  });
});
