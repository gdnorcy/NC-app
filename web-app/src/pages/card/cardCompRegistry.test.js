import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from './cardCompRegistry.js';
// admin 注册表是数据真源（PNG 图标由 vite 转 URL，测试环境可解析）
import { componentRegistry } from '../../../../web-admin/src/views/customer/apps/design/componentRegistry.js';

const root = path.resolve(__dirname, '../../../..');

describe('移动端轻量注册表 ↔ admin componentRegistry 一致性', () => {
  const adminByType = Object.fromEntries(componentRegistry.map((c) => [c.type, c]));

  test('移动端开放的 7 种组件必须存在于 admin 注册表', () => {
    const types = CARD_COMP_REGISTRY.map((c) => c.type);
    expect(types.sort()).toEqual(['button', 'channel-video', 'divider', 'image', 'notice', 'rich-text', 'spacer']);
    for (const t of types) expect(adminByType[t], `admin 缺少 ${t}`).toBeTruthy();
  });

  test('defaultProps 与 admin 逐字一致（防漂移：改 admin 忘了改移动端）', () => {
    for (const c of CARD_COMP_REGISTRY) {
      expect(c.defaultProps, `${c.type} defaultProps 漂移`).toEqual(adminByType[c.type].defaultProps);
    }
  });

  test('移动端 schema 控件键必须 ⊆ admin schema（收窄允许，发明不允许）', () => {
    for (const c of CARD_COMP_REGISTRY) {
      const adminKeys = new Set(adminByType[c.type].schema.map((s) => s.key));
      for (const s of c.schema) {
        expect(adminKeys.has(s.key), `${c.type}.${s.key} 不在 admin schema`).toBe(true);
      }
    }
  });

  test('控件类型只用移动端装修页已实现的集合', () => {
    const allowed = new Set(['input', 'image', 'color', 'slider', 'radio', 'switch', 'link', 'richtext']);
    for (const c of CARD_COMP_REGISTRY) {
      for (const s of c.schema) expect(allowed.has(s.control), `${c.type}.${s.key} 控件 ${s.control} 未实现`).toBe(true);
    }
  });
});

describe('server COMP_TYPES 白名单同步', () => {
  test('card.js 的 COMP_TYPES 与移动端开放类型完全一致', () => {
    const src = fs.readFileSync(path.join(root, 'server/src/routes/card.js'), 'utf-8');
    const m = src.match(/const COMP_TYPES = \[([^\]]+)\]/);
    expect(m, 'card.js 找不到 COMP_TYPES').toBeTruthy();
    const serverTypes = m[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, '')).sort();
    expect(serverTypes).toEqual(CARD_COMP_REGISTRY.map((c) => c.type).sort());
  });
});

describe('工具函数', () => {
  test('getCompDef / compDefaultProps', () => {
    expect(getCompDef('nope')).toBeNull();
    expect(getCompDef('image').name).toBe('图片');
    const p = compDefaultProps('divider');
    expect(p.thickness).toBe(1);
    p.thickness = 99; // 深拷贝，不污染注册表
    expect(compDefaultProps('divider').thickness).toBe(1);
  });
});
