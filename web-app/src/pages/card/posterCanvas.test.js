/**
 * 分享海报生成回归（2026-10-21 新增）
 *
 * 病根：myCard.vue 的 `shareOwnerCard()` 里在**事件处理器内**（且已 await 过）调用
 * `getCurrentInstance()`。Vue 3 的 getCurrentInstance() 依赖 setup 调用栈里的
 * `currentInstance` 全局量，事件回调 / await 之后调用**一律返回 null** →
 * `q.in(null.proxy)` 直接 TypeError（被外层 catch 吞成「海报生成失败」toast）。
 *
 * 修法：实例在 setup 顶层取一次（与 components/CardTabBar.vue 同款正确写法），
 * 事件里只做 `q.in(posterInst.proxy)`。
 *
 * 为什么单测能挡住：这类 bug 在 MP 真机上才炸（`uni build`、H5 分支、vitest 全绿），
 * 源码正则钉死「顶层取实例 + 事件里不再取」是唯一能在提交前拦住的关卡。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(here, rel), 'utf-8');
// 本测试文件与被测页面同目录（src/pages/card/），故路径不带 pages/card 前缀
const myCard = () => src('./myCard.vue');
// 🔴 数「代码里的调用」必须先剥注释：本页注释里就写着 getCurrentInstance() 的原话，
//    直接正则会连注释一起命中 → 断言数字永远大于实际调用数（同 grep 统计的老坑）。
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('myCard 海报画布实例获取时机', () => {
  const s = myCard();
  const code = stripComments(s);

  test('实例在 setup 顶层取一次（getCurrentInstance 只允许出现一次）', () => {
    const hits = code.match(/getCurrentInstance\(\)/g) || [];
    expect(hits.length, 'getCurrentInstance() 只允许在 setup 顶层出现一次').toBe(1);
    expect(code).toContain('const posterInst = getCurrentInstance();');
  });

  test('实例声明在 setup 顶层区域（组件模板之后、事件函数之前）', () => {
    // 顶层声明必须位于 <script setup> 内，且在 shareOwnerCard 定义之前
    const declAt = code.indexOf('const posterInst = getCurrentInstance();');
    const fnAt = code.indexOf('async function shareOwnerCard');
    expect(declAt).toBeGreaterThan(-1);
    expect(fnAt).toBeGreaterThan(-1);
    expect(declAt, '实例声明须在 shareOwnerCard 之前').toBeLessThan(fnAt);
  });

  test('事件里用顶层实例而非重新获取', () => {
    expect(code).toMatch(/q\.in\(posterInst\.proxy\)/);
    expect(code).not.toMatch(/createSelectorQuery\(\)\.in\(inst\.proxy\)/);
  });

  test('查不到节点时关掉弹层（否则卡在「海报生成中…」永不退出）', () => {
    expect(code).toMatch(
      /if \(!res \|\| !res\[0\] \|\| !res\[0\]\.node\) \{[\s\S]{0,200}?showPoster\.value = false;/
    );
  });
});

describe('myCard 海报画布可被查到', () => {
  const s = myCard();

  test('canvas 用 type="2d" 且未被 display:none（隐藏则拿不到 node）', () => {
    expect(s).toMatch(/<canvas id="posterCanvas" type="2d"/);
    // 离屏用位移而非 display:none
    expect(s).not.toMatch(/poster-canvas[^}]*display:\s*none/);
  });

  test('fields 必须同时要 node 与 size', () => {
    expect(s).toContain("fields({ node: true, size: true })");
  });
});

describe('myCard 海报失败路径均有可见反馈', () => {
  const s = myCard();

  test('导出失败/二维码失败/整体失败三处都有 toast', () => {
    expect(s).toContain("title: '海报绘制失败'");
    expect(s).toContain("title: '海报导出失败'");
    expect(s).toContain("title: '海报生成失败，请稍后重试'");
  });

  test('二维码接口失败不阻断海报（服务端已有 H5 兜底，前端不得二次抛）', () => {
    // fetchCardQr 抛错时 shareOwnerCard 的 catch 负责收口
    expect(s).toMatch(/catch \(e\) \{\s*showPoster\.value = false;\s*uni\.showToast/);
  });
});