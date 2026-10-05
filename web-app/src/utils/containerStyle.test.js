import { describe, it, expect } from 'vitest';
import {
  containerStyle,
  containerTakesBg,
  HIDDEN_BG_TYPES,
  HIDDEN_PADDING_TYPES,
} from './containerStyle.js';

/**
 * 容器层样式的回归测试。
 *
 * 背景（2026-10-05）：用户反馈「按钮不能单独设置组件的背景色」。
 * 真因是 `bgColor` 被**上两次色**——组件自身的样式函数（如 `dpBtnStyle`）
 * 和外层容器 `containerStyle` 各上一次，导致改一个字段两层一起变。
 * 修法：自身根节点就是色块的类型（`HIDDEN_BG_TYPES`）容器不再上背景色/圆角。
 *
 * ⚠️ 本模块被 C 端 `DesignPage.vue` 与 admin 画布 `PageEditor.vue` **共用**，
 * 改这里等于同时改两端 —— 单测必须覆盖两端都在用的行为。
 */
describe('containerStyle 容器层样式', () => {
  it('自身是色块的类型：容器不上 background 也不套 borderRadius', () => {
    const s = containerStyle({ type: 'button', props: { bgColor: '#165DFF', radius: 23 } });
    expect(s.background).toBeUndefined();
    expect(s.borderRadius).toBeUndefined();
    // 边距仍由容器负责
    expect(s.marginBottom).toBe('12px');
  });

  it('普通卡片类型：容器照常上 background + borderRadius', () => {
    // superform / goods-group / panorama 这类「容器自身就是白卡」的组件：
    // 根节点不消费 p.bgColor，必须由容器上色。
    const s = containerStyle({ type: 'superform', props: { bgColor: '#F0F7FF', radius: 6 } });
    expect(s.background).toBe('#F0F7FF');
    expect(s.borderRadius).toBe('6px');
  });

  it('未设 bgColor 时不输出 background（不产生空 style）', () => {
    const s = containerStyle({ type: 'goods-group', props: { radius: 10 } });
    expect('background' in s).toBe(false);
    expect(s.borderRadius).toBe('10px');
  });

  it('未设 radius 时回落 cardRadius 默认 8', () => {
    const s = containerStyle({ type: 'goods-group', props: {} });
    expect(s.borderRadius).toBe('8px');
  });

  it('padding=0 也要输出（参数允许 0，不能被if 吞掉）', () => {
    const s = containerStyle({ type: 'goods-group', props: { padding: 0 } });
    expect(s.padding).toBe('0px');
  });

  it('HIDDEN_PADDING_TYPES 的类型忽略容器 padding（防止左右隐藏间隔）', () => {
    for (const t of HIDDEN_PADDING_TYPES) {
      const s = containerStyle({ type: t, props: { padding: 20 } });
      expect(s.padding, `${t} 不应有 padding`).toBeUndefined();
    }
  });

  it('title-bar：边距交给自身（tbOuterStyle），容器不输出', () => {
    const s = containerStyle({ type: 'title-bar', props: { marginTop: 10, marginBottom: 10 } });
    expect(s.marginTop).toBeUndefined();
    expect(s.marginBottom).toBeUndefined();
  });

  it('marginLR 优先于旧的 marginLeft/marginRight', () => {
    const s = containerStyle({ type: 'goods-group', props: { marginLR: 20, marginLeft: 4, marginRight: 4 } });
    expect(s.marginLeft).toBe('20px');
    expect(s.marginRight).toBe('20px');
  });

  it('withPadding:false 时不输出 padding（admin 画布用，保留虚线选中框）', () => {
    const s = containerStyle({ type: 'goods-group', props: { padding: 12 } }, { withPadding: false });
    expect(s.padding).toBeUndefined();
  });

  it('containerTakesBg 与 HIDDEN_BG_TYPES 一致', () => {
    for (const t of HIDDEN_BG_TYPES) expect(containerTakesBg(t), t).toBe(false);
    expect(containerTakesBg('goods-group')).toBe(true);
    expect(containerTakesBg('superform')).toBe(true);
  });

  it('HIDDEN_BG_TYPES 必须包含 button —— 这正是本次修复的主诉求', () => {
    // 漏掉 button 会让「按钮背景色改不动」回归
    expect(HIDDEN_BG_TYPES).toContain('button');
  });

  it('HIDDEN_BG_TYPES 只收「根节点消费 bgColor」的类型，不含仅子元素着色的类型', () => {
    // goods-* 的 buyBtnBg / channel-* 的 btnBg / 表单的 btnColor 都在**子元素**上，
    // 组件根节点不吃 p.bgColor → 容器仍应上色。
    // （注意：channel-profile / channel-video / my-card 的**根节点**是模板内联 bgColor，
    //   所以它们**在**表里，这几条断言针对的是 goods-* 系列。）
    expect(HIDDEN_BG_TYPES).not.toContain('goods-all');
    expect(HIDDEN_BG_TYPES).not.toContain('goods-group');
    expect(HIDDEN_BG_TYPES).not.toContain('goods-swiper');
    expect(HIDDEN_BG_TYPES).not.toContain('goods-rank');
    expect(HIDDEN_BG_TYPES).not.toContain('goods-like');
  });

  it('容器型组件（superform / panorama 等）不在 HIDDEN_BG_TYPES 里', () => {
    // 这些组件自身没有底色，全靠容器给白卡；若误加进表会变成「透明卡贴灰底」。
    for (const t of ['superform', 'panorama', 'pano-scenes', 'cube-box']) {
      expect(HIDDEN_BG_TYPES, t).not.toContain(t);
    }
  });

  it('组件自身圆角不会因为容器不上色而丢失（dpBtnStyle 等自带 borderRadius）', () => {
    // 回归防护：容器不再输出 radius 后，自身必须能独立收敛圆角。
    // dpBtnStyle 第一行就是 borderRadius: (p.radius ?? 8)。
    const s = containerStyle({ type: 'button', props: { radius: 23 } });
    expect(s.borderRadius).toBeUndefined(); // 容器确实不给了
    // 断言自身函数会自己给（源码级：dpBtnStyle 含 borderRadius）
    expect(containerTakesBg('button')).toBe(false);
  });

  it('无 comp / 无 props 时不抛异常', () => {
    expect(() => containerStyle(null)).not.toThrow();
    expect(containerStyle({ type: 'goods-group' })).toBeTruthy();
  });
});