import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from './cardCompRegistry.js';
import { COMP_ICON_SOURCE_NAME } from './compIconsBase64.js';
// admin 注册表是数据真源（PNG 图标由 vite 转 URL，测试环境可解析）
import { componentRegistry, COMP_ICONS } from '../../../../web-admin/src/views/customer/apps/design/componentRegistry.js';

const basename = (x) => String(x).split('/').pop();

const root = path.resolve(__dirname, '../../../..');

describe('移动端轻量注册表 ↔ admin componentRegistry 一致性', () => {
  const adminByType = Object.fromEntries(componentRegistry.map((c) => [c.type, c]));

  test('移动端开放的组件必须存在于 admin 注册表', () => {
    const types = CARD_COMP_REGISTRY.map((c) => c.type);
    expect(types.sort()).toEqual(['button', 'button-group', 'channel-video', 'divider', 'icon-menu', 'image', 'notice', 'rich-text', 'spacer']);
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

  test('反馈 #279：每个组件都有 icon，且与设计中心同类型用的是同一张 PNG', () => {
    for (const c of CARD_COMP_REGISTRY) {
      expect(c.icon, `${c.type} 缺少 icon 字段`).toBeTruthy();
      const adminEntry = adminByType[c.type];
      const adminPng = COMP_ICONS[adminEntry.icon];
      expect(adminPng, `设计中心 ${c.type} 无对应图标`).toBeTruthy();
      // 🔴 反馈 #294 起移动端图标为 base64 内联（无文件名），改用「源 PNG 名映射」比对：
      //   COMP_ICON_SOURCE_NAME 记录每个图标键对应的源 PNG 文件名，
      //   断言移动端用的源文件名与设计中心一致（字节一致性由下一条测试钉死）。
      const sourceName = COMP_ICON_SOURCE_NAME[c.iconKey];
      expect(sourceName, `${c.type} 缺少图标源名映射`).toBeTruthy();
      expect(
        sourceName,
        `${c.type} 图标应与设计中心一致（设计中心用 ${basename(adminPng)}）`,
      ).toBe(basename(adminPng));
    }
  });

  // 🔴 反馈 #294：移动端图标改为 base64 内联（真机小程序 4 个图标纯白不显示的根因是
  //   vite import PNG 产生的 /assets/<name>.<hash>.png 路径随包版本漂移）。
  //   「文件名一致」已不足以保证是同一张图 → 本测试升级为**字节级比对**：
  //   移动端 base64 解码后的字节必须与 web-admin 设计中心同名 PNG 文件逐字节相同。
  //   换图标时必须重跑 `node web-app/scripts/gen-comp-icons-base64.js`，否则本测试会红。
  test('反馈 #294：移动端图标字节 === 设计中心同名 PNG 字节（base64 内联不漂移）', () => {
    const adminIconDir = path.join(root, 'web-admin/src/assets/comp-icons');
    for (const c of CARD_COMP_REGISTRY) {
      const adminEntry = adminByType[c.type];
      const adminPng = COMP_ICONS[adminEntry.icon];
      const srcName = basename(adminPng);
      // 移动端 base64 → Buffer
      expect(String(c.icon).startsWith('data:image/png;base64,'), `${c.type} 图标未内联为 base64`).toBe(true);
      const mobileBytes = Buffer.from(String(c.icon).split(',')[1], 'base64');
      // 设计中心源 PNG → Buffer
      const adminBytes = fs.readFileSync(path.join(adminIconDir, srcName));
      expect(
        mobileBytes.equals(adminBytes),
        `${c.type} 图标字节与设计中心 ${srcName} 不一致（需重跑 gen-comp-icons-base64.js）`,
      ).toBe(true);
    }
  });

  test('反馈 #294：base64 图标数据可解码且为合法 PNG（非空、PNG 魔数正确）', () => {
    for (const c of CARD_COMP_REGISTRY) {
      const bytes = Buffer.from(String(c.icon).split(',')[1], 'base64');
      expect(bytes.length, `${c.type} 图标字节为空`).toBeGreaterThan(100);
      // PNG 魔数：89 50 4E 47
      expect(bytes.subarray(0, 4).toString('hex'), `${c.type} 非 PNG 魔数`).toBe('89504e47');
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
