import { describe, it, expect } from 'vitest';
import {
  containerStyle,
  migrateLegacyBgColor,
  selfColored,
  CONTAINER_BG_KEY,
  HIDDEN_PADDING_TYPES,
} from './containerStyle.js';

/**
 * 容器底色字段拆分（2026-10-05 用户定规）
 *
 * `bgColor`     = 组件**自身**底色（button 的 label 叫「按钮色」）
 * `compBgColor` = 组件**容器**底色（面板「组件背景色」）
 *
 * 本文件重点回归「**两个字段互不干扰**」——上一轮用 HIDDEN_BG_TYPES 黑名单
 * 让容器不上色来绕开同名字段，是逐类型手工维护的易腐清单（已漏判 goods-list 等），
 * 该方案已废弃。**不要复活黑名单，也不要把这两层重新合并回同一个字段。**
 */
describe('containerStyle 容器层（compBgColor）', () => {
  it('容器底色读 compBgColor，而不是 bgColor', () => {
    const s = containerStyle({ type: 'superform', props: { compBgColor: '#EEF3FF', bgColor: '#FF0000' } });
    expect(s.background).toBe('#EEF3FF');
  });

  it('🔴 核心回归：按钮自身底色与容器底色互不干扰', () => {
    // 这是用户诉求本体：改按钮色不动容器，改容器底色不动按钮
    const ownOnly = containerStyle({ type: 'button', props: { bgColor: '#165DFF' } });
    expect(ownOnly.background).toBeUndefined();   // 容器不上色

    const boxOnly = containerStyle({ type: 'button', props: { compBgColor: '#FFF7E6' } });
    expect(boxOnly.background).toBe('#FFF7E6');    // 容器上色
  });

  it('未设 compBgColor 时不输出 background（透明，让页面底色透出）', () => {
    const s = containerStyle({ type: 'superform', props: {} });
    expect('background' in s).toBe(false);
  });

  it('compBgColor 为空串时也不输出 background', () => {
    const s = containerStyle({ type: 'superform', props: { compBgColor: '' } });
    expect('background' in s).toBe(false);
  });

  it('compBgColor 支持渐变字符串（PeColorPicker 渐变预设原样透传）', () => {
    const g = 'linear-gradient(135deg,#2979ff,#00b0ff)';
    const s = containerStyle({ type: 'superform', props: { compBgColor: g } });
    expect(s.background).toBe(g);
  });

  it('withBg:false 时不输出 background（需要只取边距的调用方）', () => {
    const s = containerStyle({ type: 'superform', props: { compBgColor: '#FFF' } }, { withBg: false });
    expect(s.background).toBeUndefined();
  });

  it('容器圆角与底色独立：设了 compBgColor 不影响 borderRadius', () => {
    const s = containerStyle({ type: 'superform', props: { compBgColor: '#FFF', radius: 20 } });
    expect(s.borderRadius).toBe('20px');
  });

  it('withRadius:false 时不输出 borderRadius（画布选中框需要自带圆角）', () => {
    const s = containerStyle({ type: 'button', props: { radius: 23 } }, { withRadius: false });
    expect(s.borderRadius).toBeUndefined();
  });

  it('CONTAINER_BG_KEY 必须是 compBgColor（面板/迁移/消费三处共用同一常量）', () => {
    expect(CONTAINER_BG_KEY).toBe('compBgColor');
  });
});

describe('containerStyle 边距 / 内边距（原语义不变）', () => {
  it('未设 radius 时回落 cardRadius 默认 8', () => {
    expect(containerStyle({ type: 'superform', props: {} }).borderRadius).toBe('8px');
  });

  it('radius=0 也要输出（不能被 if 判空吞掉，否则「设 0 无效」）', () => {
    expect(containerStyle({ type: 'superform', props: { radius: 0 } }).borderRadius).toBe('0px');
  });

  it('padding=0 也要输出', () => {
    expect(containerStyle({ type: 'superform', props: { padding: 0 } }).padding).toBe('0px');
  });

  it('HIDDEN_PADDING_TYPES 忽略容器 padding', () => {
    for (const t of HIDDEN_PADDING_TYPES) {
      expect(containerStyle({ type: t, props: { padding: 10 } }).padding).toBeUndefined();
    }
  });

  it('title-bar 边距交给自身', () => {
    const s = containerStyle({ type: 'title-bar', props: { marginTop: 10, marginBottom: 10 } });
    expect(s.marginTop).toBeUndefined();
    expect(s.marginBottom).toBeUndefined();
  });

  it('marginLR 优先于 marginLeft/marginRight', () => {
    const s = containerStyle({ type: 'superform', props: { marginLR: 20, marginLeft: 0, marginRight: 0 } });
    expect(s.marginLeft).toBe('20px');
    expect(s.marginRight).toBe('20px');
  });

  it('withPadding:false 时不输出 padding（admin 画布用）', () => {
    expect(containerStyle({ type: 'superform', props: { padding: 10 } }, { withPadding: false }).padding).toBeUndefined();
  });

  it('无 comp / 无 props 不抛异常', () => {
    expect(() => containerStyle(null)).not.toThrow();
    expect(() => containerStyle({ type: 'x' })).not.toThrow();
  });
});

describe('存量迁移 migrateLegacyBgColor（2026-10-05）', () => {
  it('容器型组件的旧 bgColor 搬到 compBgColor（否则运营设的底色会消失）', () => {
    // superform 拆分前 bgColor 打在容器上，而它根节点不读 bgColor → 不搬就丢色
    const c = { type: 'superform', props: { bgColor: '#EEF3FF' } };
    expect(migrateLegacyBgColor(c)).toBe(true);
    expect(c.props.compBgColor).toBe('#EEF3FF');
  });

  it('自身着色的组件不搬（button 的 bgColor 是按钮色，搬走就错了）', () => {
    const c = { type: 'button', props: { bgColor: '#165DFF' } };
    expect(migrateLegacyBgColor(c)).toBe(false);
    expect(c.props.compBgColor).toBeUndefined();
    expect(c.props.bgColor).toBe('#165DFF');
  });

  it('新字段已有值时不覆盖（幂等，且不丢运营新设的色）', () => {
    const c = { type: 'superform', props: { bgColor: '#OLD', compBgColor: '#NEW' } };
    expect(migrateLegacyBgColor(c)).toBe(false);
    expect(c.props.compBgColor).toBe('#NEW');
  });

  it('旧 bgColor 为空串不迁移', () => {
    const c = { type: 'superform', props: { bgColor: '' } };
    expect(migrateLegacyBgColor(c)).toBe(false);
    expect(c.props.compBgColor).toBeUndefined();
  });

  it('连续迁移两次结果一致（幂等）', () => {
    const c = { type: 'goods-group', props: { bgColor: '#F5F5F5' } };
    migrateLegacyBgColor(c);
    const snapshot = c.props.compBgColor;
    expect(migrateLegacyBgColor(c)).toBe(false);
    expect(c.props.compBgColor).toBe(snapshot);
  });

  it('无 props / 空对象不抛异常', () => {
    expect(() => migrateLegacyBgColor(null)).not.toThrow();
    expect(() => migrateLegacyBgColor({ type: 'button' })).not.toThrow();
  });

  it('selfColored 判定覆盖 button/notice/image 等自身着色类型', () => {
    for (const t of ['button', 'notice', 'image', 'search', 'my-card', 'channel-profile']) {
      expect(selfColored(t)).toBe(true);
    }
  });

  it('selfColored 对容器型组件为 false（这些才需要迁移）', () => {
    for (const t of ['superform', 'goods-group', 'goods-all', 'goods-swiper', 'goods-rank', 'goods-like']) {
      expect(selfColored(t)).toBe(false);
    }
  });
});
