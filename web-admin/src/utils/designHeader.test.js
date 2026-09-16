import { describe, it, expect } from 'vitest';
import { mergeEwHeader, mergeEwLayer } from './designHeader.js';

const mkGlobal = () => ({
  funcModule: 'single',
  textColor: 'black',
  headBg: { mode: 'color', color: '#ffffff', image: '' },
  scrollBg: { mode: 'color', color: 'transparent', image: '' },
  layers: [
    { left: { type: 'icon', icon: 'user' }, middle: { type: 'search', search: { fillBg: '#eee', placeholder: '全局占位' } }, right: { type: 'none' } },
    { left: { type: 'none' }, middle: { type: 'none' }, right: { type: 'none' } },
  ],
  copyright: 'default',
});

describe('mergeEwHeader（头部方案二：全局默认 + 单页覆盖）', () => {
  it('仅全局默认 → 返回全局 ew 完整结构', () => {
    const h = mergeEwHeader(mkGlobal(), {});
    expect(h.funcModule).toBe('single');
    expect(h.layers.length).toBe(2);
    expect(h.layers[0].left.type).toBe('icon');
    expect(h.layers[0].middle.type).toBe('search');
    expect(h.layers[0].middle.search.fillBg).toBe('#eee');
    expect(h.layers[0].middle.search.placeholder).toBe('全局占位');
  });

  it('页面覆盖全局：funcModule / textColor / headBg', () => {
    const page = { funcModule: 'double', textColor: 'white', headBg: { mode: 'color', color: '#123456' } };
    const h = mergeEwHeader(mkGlobal(), page);
    expect(h.funcModule).toBe('double');
    expect(h.textColor).toBe('white');
    expect(h.headBg.color).toBe('#123456');
    expect(h.scrollBg.color).toBe('transparent'); // 未覆盖 → 继承全局
  });

  it('layers 逐段覆盖：页面 icon → 覆盖；未覆盖字段继承全局', () => {
    const page = { layers: [{ left: { type: 'image', image: '/uploads/a.png' }, middle: { type: 'search', search: { placeholder: '页面占位' } } }] };
    const h = mergeEwHeader(mkGlobal(), page);
    expect(h.layers[0].left.type).toBe('image');
    expect(h.layers[0].left.image).toBe('/uploads/a.png');
    expect(h.layers[0].middle.search.fillBg).toBe('#eee'); // 页面未覆盖 → 继承全局
    expect(h.layers[0].middle.search.placeholder).toBe('页面占位');
    expect(h.layers[1].left.type).toBe('none'); // 第二层页面未覆盖 → 兜底
  });

  it('store 深层合并', () => {
    const global = { layers: [{ left: { type: 'store', store: { name: '总店', color: '#111111' } } }] };
    const page = { layers: [{ left: { store: { name: '分店' } } }] };
    const h = mergeEwHeader(global, page);
    expect(h.layers[0].left.store.name).toBe('分店');
    expect(h.layers[0].left.store.color).toBe('#111111'); // 未覆盖字段继承全局
  });

  it('缺省兜底：空输入返回默认结构', () => {
    const h = mergeEwHeader(null, null);
    expect(h.funcModule).toBe('none');
    expect(h.textColor).toBe('black');
    expect(h.layers.length).toBe(2);
    expect(h.layers[0].left.type).toBe('none');
    expect(h.layers[0].middle.search.showBtn).toBe(true);
  });
});

describe('mergeEwLayer', () => {
  it('页面覆盖全局单层三段', () => {
    const g = { left: { type: 'icon', icon: 'user' }, middle: { type: 'none' }, right: { type: 'icon', icon: 'card' } };
    const p = { left: { type: 'image', image: '/x.png' }, middle: { type: 'search' }, right: { type: 'none' } };
    const l = mergeEwLayer(g, p);
    expect(l.left.type).toBe('image');
    expect(l.middle.type).toBe('search');
    expect(l.middle.search.fillBg).toBe('#f2f2f2'); // 默认值
    expect(l.right.type).toBe('none');
  });
});
