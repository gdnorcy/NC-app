// 基础组件契约测试（P0：Skeleton / Badge / Popup）
// 验证：可编译、name 正确、props 契约（存在性/类型/默认值）
import { describe, it, expect } from 'vitest';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadComponentOptions(rel) {
  const src = readFileSync(join(__dirname, rel), 'utf-8');
  const { descriptor, errors } = parse(src, { filename: rel });
  expect(errors).toEqual([]);
  // 模板必须可编译（渲染链路）
  expect(compileTemplate({ source: descriptor.template.content, filename: rel, id: rel }).errors).toEqual([]);
  const script = compileScript(descriptor, { id: rel });
  // 组件 script 无 import；把 ESM export 转为 CJS 可执行
  expect(script.content).not.toMatch(/^import /m);
  const code = script.content.replace(/export\s+default/, 'const __sfc__ =');
  const factory = new Function(`${code}; return __sfc__;`);
  return factory();
}

function normalizeProps(def) {
  const out = {};
  for (const [k, v] of Object.entries(def || {})) {
    out[k] = { type: v?.type?.name || typeof v, default: v?.default ?? null };
  }
  return out;
}

describe('Skeleton.vue', () => {
  it('编译通过且 name 正确', () => {
    const opts = loadComponentOptions('Skeleton.vue');
    expect(opts.name).toBe('Skeleton');
  });
  it('props 契约：loading/rows/avatar/title', () => {
    const props = normalizeProps(loadComponentOptions('Skeleton.vue').props);
    expect(Object.keys(props).sort()).toEqual(['avatar', 'loading', 'rows', 'title']);
    expect(props.loading.default).toBe(true);
    expect(props.rows.default).toBe(3);
    expect(props.avatar.default).toBe(false);
    expect(props.title.default).toBe(false);
  });
});

describe('Badge.vue', () => {
  it('编译通过且 name 正确', () => {
    const opts = loadComponentOptions('Badge.vue');
    expect(opts.name).toBe('Badge');
  });
  it('props 契约：count/max/dot/color', () => {
    const props = normalizeProps(loadComponentOptions('Badge.vue').props);
    expect(Object.keys(props).sort()).toEqual(['color', 'count', 'dot', 'max']);
    expect(props.count.default).toBe(0);
    expect(props.max.default).toBe(99);
    expect(props.dot.default).toBe(false);
    expect(props.color.default).toBe('#f53f3f');
  });
});

describe('Popup.vue', () => {
  it('编译通过且 name 正确', () => {
    const opts = loadComponentOptions('Popup.vue');
    expect(opts.name).toBe('Popup');
  });
  it('props 契约：show/position/maskClosable/round', () => {
    const props = normalizeProps(loadComponentOptions('Popup.vue').props);
    expect(Object.keys(props).sort()).toEqual(['maskClosable', 'position', 'round', 'show']);
    expect(props.show.default).toBe(false);
    expect(props.position.default).toBe('bottom');
    expect(props.maskClosable.default).toBe(true);
    expect(props.round.default).toBe(false);
  });
  it('methods 含遮罩点击关闭（maskClosable=false 时不触发 close）', () => {
    const opts = loadComponentOptions('Popup.vue');
    expect(typeof opts.methods.onMaskClick).toBe('function');
  });
});
