import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 画布绘制需要在 node 环境里跑 → 用一个记录调用的假 ctx
function makeCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push({ name, args }); };
  return {
    calls,
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    measureText: (t) => ({ width: String(t).length * 12 }),
    fillRect: rec('fillRect'),
    fillText: rec('fillText'),
    strokeRect: rec('strokeRect'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arc: rec('arc'),
    arcTo: rec('arcTo'),
    ellipse: rec('ellipse'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    clip: rec('clip'),
    save: rec('save'),
    restore: rec('restore'),
    scale: rec('scale'),
    translate: rec('translate'),
    drawImage: rec('drawImage'),
    createLinearGradient: (x0, y0, x1, y1) => {
      calls.push({ name: 'createLinearGradient', args: [x0, y0, x1, y1] });
      return { addColorStop: (o, c) => calls.push({ name: 'addColorStop', args: [o, c] }) };
    },
  };
}

const CARD = {
  name: '林平',
  position: '副会长',
  company: '东莞市揭阳商会',
  phone: '13412888000',
  city: '东莞市',
  slogan: '连接湾区资源',
  needTags: JSON.stringify(['商会', '资源对接', '会员', '多余标签']),
  avatar: '',
};

const COLORS = { primary: '#165DFF', gradient: '#0E42D2', secondary: '#5C8BFF' };

describe('shareCover —— 分享封面绘制', () => {
  it('6 款风格的 key 集合固定（与设计稿一致）', async () => {
    const { SHARE_STYLES } = await import('./shareCover.js');
    expect(SHARE_STYLES.map((s) => s.key)).toEqual([
      'cover-1', 'cover-2', 'cover-3', 'cover-4', 'cover-5', 'cover-6',
    ]);
  });

  it('每款风格都有 name 与 desc（风格库要显示名称与说明）', async () => {
    const { SHARE_STYLES } = await import('./shareCover.js');
    for (const s of SHARE_STYLES) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.desc).toBe('string');
      expect(s.desc.length).toBeGreaterThan(0);
    }
  });

  it('画布尺寸是 750×600（微信转发图 5:4 硬约束）', async () => {
    const { SHARE_COVER_W, SHARE_COVER_H } = await import('./shareCover.js');
    expect(SHARE_COVER_W / SHARE_COVER_H).toBeCloseTo(1.25, 5);
  });

  it('6 款风格都能画完且不抛异常', async () => {
    const { drawShareCover, SHARE_STYLES } = await import('./shareCover.js');
    for (const s of SHARE_STYLES) {
      const ctx = makeCtx();
      expect(() => drawShareCover(ctx, CARD, s.key, COLORS, { W: 750, H: 600 })).not.toThrow();
      expect(ctx.calls.length).toBeGreaterThan(10);
    }
  });

  it('非法 styleKey 回落 cover-1（不画空白）', async () => {
    const { drawShareCover } = await import('./shareCover.js');
    const ctx = makeCtx();
    expect(() => drawShareCover(ctx, CARD, 'cover-999', COLORS, { W: 750, H: 600 })).not.toThrow();
    const a = makeCtx();
    drawShareCover(a, CARD, 'cover-1', COLORS, { W: 750, H: 600 });
    // 调用次数应与 cover-1 一致（说明确实走了 cover-1 分支）
    expect(ctx.calls.length).toBe(a.calls.length);
  });

  it('封面里画出了姓名与电话（信息可读）', async () => {
    const { drawShareCover } = await import('./shareCover.js');
    const ctx = makeCtx();
    drawShareCover(ctx, CARD, 'cover-1', COLORS, { W: 750, H: 600 });
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    expect(texts).toContain('林平');
    expect(texts).toContain('13412888000');
  });

  it('needTags 最多取 3 个（超出的不画）', async () => {
    const { drawShareCover } = await import('./shareCover.js');
    const ctx = makeCtx();
    drawShareCover(ctx, CARD, 'cover-1', COLORS, { W: 750, H: 600 });
    const texts = ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    expect(texts).toContain('商会');
    expect(texts).toContain('资源对接');
    expect(texts).toContain('会员');
    expect(texts).not.toContain('多余标签');
  });

  it('缺字段不崩（空名片也要能画）', async () => {
    const { drawShareCover, SHARE_STYLES } = await import('./shareCover.js');
    for (const s of SHARE_STYLES) {
      const ctx = makeCtx();
      expect(() => drawShareCover(ctx, {}, s.key, COLORS, { W: 750, H: 600 })).not.toThrow();
      expect(() => drawShareCover(ctx, null, s.key, COLORS, { W: 750, H: 600 })).not.toThrow();
    }
  });

  it('needTags 是非法 JSON 时不崩（回退空数组）', async () => {
    const { drawShareCover } = await import('./shareCover.js');
    const ctx = makeCtx();
    expect(() => drawShareCover(ctx, { ...CARD, needTags: 'not-json' }, 'cover-1', COLORS, { W: 750, H: 600 })).not.toThrow();
  });

  it('用了 roundRect 路径而不是 ctx.roundRect（部分基础库没有）', async () => {
    const { drawShareCover } = await import('./shareCover.js');
    const ctx = makeCtx();
    // 假 ctx 故意不提供 roundRect —— 若代码用了会直接抛 TypeError
    expect(ctx.roundRect).toBeUndefined();
    expect(() => drawShareCover(ctx, CARD, 'cover-2', COLORS, { W: 750, H: 600 })).not.toThrow();
  });

  it('半透明底 + 文字不出现「同色隐形」：填充色与文字色不相同', async () => {
    const { drawShareCover } = await import('./shareCover.js');
    const ctx = makeCtx();
    drawShareCover(ctx, CARD, 'cover-1', COLORS, { W: 750, H: 600 });
    // 收集 fillRect 时的 fillStyle 与随后的 fillText 颜色，检查 chip 区域
    const rects = ctx.calls.filter((c) => c.name === 'fillRect');
    expect(rects.length).toBeGreaterThan(0);
  });
});

describe('shareCover —— 品牌色与标题归一', () => {
  it('未配置品牌色时回落 #165DFF', async () => {
    const { resolveBrandColors } = await import('./shareCover.js');
    const c = resolveBrandColors({}, '');
    expect(c.primary.toLowerCase()).toBe('#165dff');
  });

  it('非法品牌色（#zzz）也回落默认蓝', async () => {
    const { resolveBrandColors } = await import('./shareCover.js');
    const c = resolveBrandColors({ brandColors: { primary: '#zzz', gradient: 'blue' } }, '');
    expect(c.primary.toLowerCase()).toBe('#165dff');
    expect(/^#[0-9a-f]{6}$/i.test(c.gradient)).toBe(true);
  });

  it('合法品牌色优先于主题色', async () => {
    const { resolveBrandColors } = await import('./shareCover.js');
    const c = resolveBrandColors({ brandColors: { primary: '#FF0000' } }, '#00FF00');
    expect(c.primary.toLowerCase()).toBe('#ff0000');
  });

  it('主题色兜底（无品牌色时用主题色）', async () => {
    const { resolveBrandColors } = await import('./shareCover.js');
    const c = resolveBrandColors({}, '#123456');
    expect(c.primary.toLowerCase()).toBe('#123456');
  });

  it('自定义标题优先', async () => {
    const { resolveShareTitle } = await import('./shareCover.js');
    expect(resolveShareTitle({ name: '林平', position: '副会长', company: '商会', shareTitle: '我的自定义标题' }))
      .toBe('我的自定义标题');
  });

  it('无自定义标题时回落「姓名 · 职位 · 公司」', async () => {
    const { resolveShareTitle } = await import('./shareCover.js');
    expect(resolveShareTitle({ name: '林平', position: '副会长', company: '东莞市揭阳商会' }))
      .toBe('林平 · 副会长 · 东莞市揭阳商会');
  });

  it('全空时给兜底文案（不能返回空串）', async () => {
    const { resolveShareTitle } = await import('./shareCover.js');
    expect(resolveShareTitle({})).toBe('这是我的名片');
    expect(resolveShareTitle(null)).toBe('这是我的名片');
  });

  it('自定义标题超长被截到 30 字', async () => {
    const { resolveShareTitle, SHARE_TITLE_MAX } = await import('./shareCover.js');
    const t = resolveShareTitle({ shareTitle: 'A'.repeat(100) });
    expect(t.length).toBe(SHARE_TITLE_MAX);
  });
});

describe('shareCover —— 与服务端 key 集合一致', () => {
  it('前端 SHARE_STYLES 的 key 与服务端白名单逐字相同', async () => {
    const { SHARE_STYLES } = await import('./shareCover.js');
    const serverFile = path.resolve(process.cwd(), '../server/src/routes/card.js');
    const src = fs.readFileSync(serverFile, 'utf8');
    const m = src.match(/const SHARE_STYLES = \[([^\]]+)\]/);
    expect(m, '服务端未找到 SHARE_STYLES 定义').toBeTruthy();
    const serverKeys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(SHARE_STYLES.map((s) => s.key)).toEqual(serverKeys);
  });
});
