import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 原生组件（native-*）容器样式 —— **直接从真实源码提取执行**（2026-10-07）
 *
 * 🔴 背景：用户反馈「名片搜索框组件的参数有问题，跟『按钮』有同样的问题，
 *   背景设置也是设置组件本身，容器的背景设置没有地方设置」。
 *   病根：两端 `nativeMargin()` 只输出边距，**完全不消费 `compBgColor`** →
 *   面板通用项里那个「组件背景色」控件能拖、预览不变 = **参数被架空**。
 *
 * 🔴 为什么用「提取源码再执行」而不是抄一份副本：
 *   抄副本 = 锁的是副本，真实实现改了测试照样绿（本项目已吃过这个亏）。
 *   从 .vue 源文件里正则提取函数体、用 new Function 构造后执行 → 真实实现。
 *
 * ⚠️ 两端同源手写、互不共享（已因此只修一端、留半边 bug 两次）：
 *   - admin `web-admin/src/views/customer/apps/design/ComponentRender.vue`
 *   - C 端  `web-app/src/pages/cardMain/home.vue`
 *   下面 `两端实现一致` 一例专门锁这个。
 */

const ROOT = path.resolve(__dirname, '../../..');
const SRC = {
  admin: path.join(ROOT, 'web-admin/src/views/customer/apps/design/ComponentRender.vue'),
  cEnd: path.join(ROOT, 'web-app/src/pages/cardMain/home.vue'),
};

function loadNativeMargin(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/function nativeMargin\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (!m) throw new Error('未在 ' + file + ' 中匹配到 nativeMargin()');
  // eslint-disable-next-line no-new-func
  return new Function('return (' + m[0] + ')')();
}

const adminMargin = loadNativeMargin(SRC.admin);
const cEndMargin = loadNativeMargin(SRC.cEnd);

describe('nativeMargin 原生组件容器样式（真实源码）', () => {
  for (const [name, fn] of [['admin', adminMargin], ['C端', cEndMargin]]) {
    describe(name, () => {
      it('🔴 必须消费 compBgColor（容器底色）—— 否则面板控件被架空', () => {
        expect(fn({ compBgColor: '#e36f6f' }).background).toBe('#e36f6f');
      });

      it('compBgColor 未设/空串 → 不输出 background（保留组件自身底色）', () => {
        expect(fn({ compBgColor: '' }).background).toBeUndefined();
        expect(fn({}).background).toBeUndefined();
      });

      it('容器圆角用独立字段 radiusContainer，与组件自身 radius 不撞名', () => {
        const s = fn({ radiusContainer: 12, radius: 18 });
        expect(s.borderRadius).toBe('12px');
        expect(s.radius).toBeUndefined();
      });

      it('radiusContainer 未设/空串 → 不输出（CSS 兜底仍生效）', () => {
        expect(fn({ radius: 18 }).borderRadius).toBeUndefined();
        expect(fn({ radiusContainer: '' }).borderRadius).toBeUndefined();
      });

      it('左右边距读 marginLR，允许 0（故意通栏）', () => {
        expect(fn({ marginLR: 0 })).toMatchObject({ marginLeft: '0px', marginRight: '0px' });
        expect(fn({ marginLR: 12 })).toMatchObject({ marginLeft: '12px', marginRight: '12px' });
      });
    });
  }

  it('两端 marginBottom 缺省都兜 8px（保证卡间白缝，不会全部贴死）', () => {
    expect(adminMargin({}).marginBottom).toBe('8px');
    expect(cEndMargin({}).marginBottom).toBe('8px');
  });

  it('🔴 两端实现一致（marginLR / compBgColor / radiusContainer 的输出必须相同）', () => {
    const cases = [
      {}, { marginLR: 0 }, { marginLR: 12 }, { marginTop: 6, marginBottom: 10 },
      { compBgColor: '#123456' }, { radiusContainer: 8 },
      { marginLR: 8, marginTop: 4, marginBottom: 6, compBgColor: '#abc', radiusContainer: 10 },
    ];
    for (const c of cases) {
      const a = adminMargin(c);
      const b = cEndMargin(c);
      for (const k of ['marginLeft', 'marginRight', 'background', 'borderRadius']) {
        expect(String(a[k]), `两端 ${k} 不一致: ${JSON.stringify(c)}`).toBe(String(b[k]));
      }
    }
  });

  it('容器底色与组件自身底色 bgColor 是两个独立字段，互不影响', () => {
    for (const fn of [adminMargin, cEndMargin]) {
      const s = fn({ compBgColor: '#111', bgColor: '#f2f3f5' });
      expect(s.background).toBe('#111'); // 容器层
      expect(s.bgColor).toBeUndefined(); // 自身底色不走容器函数
    }
  });
});