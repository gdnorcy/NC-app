/**
 * 名片业务页「隐性 bug」回归测试（2026-10-08 审查）
 *
 * ⚠️ 这些页面的 bug 都无法从 .vue 里直接 import（含 uni / 模板依赖），
 *    故沿用本项目的做法：**从 .vue 源码正则提取函数体 + new Function 执行**
 *    （抄一份副本进测试是锁不住真实实现的）。
 *
 * 覆盖：
 *  ① visitors.vue  convertFromIntent —— 关闭弹层后再读 leadIntent.value 必崩
 *  ② member.vue    openMember        —— 支付确认未 await，paying 锁提前释放可重复下单
 *
 * 设计要点：两个函数都依赖闭包内的 ref / uni API，这里用最小桩替换，
 * 只验证**控制流**（谁先关系、锁何时释放），不验证 UI。
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src/pages/card');

/** 提取形如 `function name(...) {` 到行首 `}` 的完整函数体（**已剥行注释**） */
function extractFn(file, name) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // ⚠️ 必须剥注释：本项目的修复注释会引用缺陷原文（如 leadIntent.value），
  //    不剥就会把「注释里描述的老写法」当成真实代码命中。
  const src = raw.replace(/^\s*\/\/.*$/gm, '');
  const m = src.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`));
  expect(m, `${file} 应能找到 ${name}()`).toBeTruthy();
  return { body: m[1], src };
}

describe('访客雷达 visitors.vue：意向转客户', () => {
  function makeCtx() {
    const state = {
      leadIntent: { value: { visitorOpenid: 'oA', visitorName: '张三' } }, // ref 桩
      visitors: { value: [] },                                           // 列表不含该访客（走兜底分支）
      calls: [],
    };
    const closeLeadIntent = () => { state.leadIntent.value = null; };
    const convert = (v) => state.calls.push(v);
    const fn = new Function('state', 'closeLeadIntent', 'convert', 'visitors', 'leadIntent', `
      ${extractFn('visitors.vue', 'convertFromIntent').body}
    `);
    return { state, fn, run: () => fn(state, closeLeadIntent, convert, state.visitors, state.leadIntent) };
  }

  it('🔴 关闭后再异步转换：不能读已清空的 leadIntent（原实现必抛 TypeError）', async () => {
    vi.useFakeTimers();
    try {
      const ctx = makeCtx();
      expect(() => ctx.run()).not.toThrow();
      vi.advanceTimersByTime(300);
      // 关键：必须仍然用快照构造出兜底对象，而不是读到 null 炸掉
      expect(ctx.state.calls).toHaveLength(1);
      expect(ctx.state.calls[0].nickname).toBe('张三');
      expect(ctx.state.calls[0].tag).toBe('高意向');
    } finally {
      vi.useRealTimers();
    }
  });

  it('列表里能匹配到访客时，转换的是完整访客对象而非兜底', async () => {
    vi.useFakeTimers();
    try {
      const ctx = makeCtx();
      ctx.state.visitors.value = [{ visitorOpenid: 'oA', nickname: '李四' }];
      ctx.run();
      vi.advanceTimersByTime(300);
      expect(ctx.state.calls[0].nickname).toBe('李四');
    } finally {
      vi.useRealTimers();
    }
  });

  it('源码里不得再出现 closeLeadIntent 之后的 leadIntent.value 解引用', () => {
    const { body } = extractFn('visitors.vue', 'convertFromIntent');
    const bodyAfter = body.slice(body.indexOf('closeLeadIntent()'));
    expect(bodyAfter).not.toMatch(/leadIntent\.value/);
  });
});

describe('会员中心 member.vue：支付并发锁', () => {
  it('🔴 支付确认必须被 await（否则 try/finally 提前解锁 → 重复下单）', () => {
    const { body } = extractFn('member.vue', 'openMember');
    // showModal 是异步回调 API，只有包成 await 住的 Promise，锁才能覆盖到支付回调结束
    expect(body).toMatch(/await\s+new\s+Promise[\s\S]*showModal|await\s+confirmPay|await\s+payConfirm/);
    // 且不能在 try 里留下未被 await 的裸 showModal 回调
    expect(body).not.toMatch(/uni\.showModal\(\{[\s\S]*success: async \(res\) => \{[\s\S]*\}\s*\}\);\s*\n\s*\} catch/);
  });

  it('用户取消支付时直接 return，不再发起支付请求', () => {
    const { body } = extractFn('member.vue', 'openMember');
    const idx = body.indexOf('mockPay');
    expect(idx).toBeGreaterThan(-1);
    // mockPay 之前必须存在一道「未确认就返回」的闸门
    const before = body.slice(0, idx);
    expect(before).toMatch(/if\s*\(!\s*(payConfirmed|confirmed)[\s\S]{0,20}\)\s*return/);
  });
});
