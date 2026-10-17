import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 冷启动 reLaunch 竞态回归（2026-10-21 真机报修「扫体验码打开是空白，要点左上角回首页才会加载出首页」）：
// onShow 里 designConfig 请求返回后立刻 reLaunch，可能早于入口页首帧渲染完成；
// WeChat 在该时机处理 reLaunch，目标页（装修首页）停在空白首帧，需二次进入才恢复。
// 修复：reLaunch 延到本页 onReady（首帧渲染完成）之后。
// 验证手段：scripts/sim-coldstart.cjs（Node + 真 Vue 实跑构建产物，断言 reLaunch 严格晚于 onReady）。
const here = import.meta.url;
const read = (p) => readFileSync(fileURLToPath(new URL(p, here)), 'utf8');
const LOGIN = read('./login.vue');
const HOME = read('./home.vue');

describe('冷启动 reLaunch 竞态防护（onReady 后才跳转）', () => {
  test('login.vue：onShow 首页联动跳转必须等本页首帧渲染完成', () => {
    // onReady 就绪信号
    expect(LOGIN).toContain('const firstRenderDone = new Promise');
    expect(LOGIN).toContain('onReady(() => resolveFirstRender());');
    // reLaunch 前必须 await 就绪信号（顺序敏感：await 在 reLaunch 之前）
    const awaitIdx = LOGIN.indexOf('await firstRenderDone;');
    const reLaunchIdx = LOGIN.indexOf('uni.reLaunch({ url: target });');
    expect(awaitIdx).toBeGreaterThan(0);
    expect(reLaunchIdx).toBeGreaterThan(awaitIdx);
  });

  test('home.vue：自身 onShow 跳转同样加就绪防护', () => {
    expect(HOME).toContain('const homeFirstRenderDone = new Promise');
    expect(HOME).toContain('onReady(() => resolveHomeFirstRender());');
    const awaitIdx = HOME.indexOf('await homeFirstRenderDone;');
    const reLaunchIdx = HOME.lastIndexOf('uni.reLaunch({ url: target });');
    expect(awaitIdx).toBeGreaterThan(0);
    expect(reLaunchIdx).toBeGreaterThan(awaitIdx);
  });

  test('login.vue 仍从 @dcloudio/uni-app 引入 onReady', () => {
    expect(LOGIN).toContain("import { onShow, onReady } from '@dcloudio/uni-app';");
  });

  test('home.vue 仍从 @dcloudio/uni-app 引入 onReady', () => {
    expect(HOME).toContain("import { onShow, onLoad, onReady, onPageScroll, onShareAppMessage, onPullDownRefresh } from '@dcloudio/uni-app';");
  });
});
