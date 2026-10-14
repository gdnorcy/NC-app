import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';
import { LINK_CATALOG } from './linkCatalog.js';

// 链接选择器目录回归锁（2026-10-15）。
// 背景：用户报「选择个人中心，与首页一齐选中」——根因是 linkCatalog 里
// 「个人中心」value 误写成 /pages/cardMain/home（与「首页」同路径），
// 而 LinkPicker 选中态用 value 单值匹配，同 value 必互染。
// 修复两层：① 路径归正（个人中心=profile）；② 目录项加唯一 key，
// 选中态/v-for key 改 it.key || it.value，任何同 value 对都不再互染。
//
// 锁：① 个人中心路径归正；② key 全目录唯一；③ value 路径必须在 C 端
// pages.json 注册（防再写错路径）；④ 同 value 对 key 必须不同；
// ⑤ LinkPicker 选中态机制用 key 不用裸 value。

const here = import.meta.url;
const PAGES_JSON = fileURLToPath(new URL('../../../../../../web-app/src/pages.json', here));
const PICKER = fileURLToPath(new URL('./LinkPicker.vue', here));

const pagesSrc = readFileSync(PAGES_JSON, 'utf8');
const pickerSrc = readFileSync(PICKER, 'utf8');

// C 端已注册页面集合：主包 pages[].path 是全路径；分包 subPackages[].root + pages[].path 拼接
// ⚠️ 不能正则抓 "path" 字面值——分包里是相对 root 的短名（home/index），漏拼 root 会误报未注册
const pagesJson = JSON.parse(pagesSrc);
const registered = new Set(pagesJson.pages.map((p) => p.path));
for (const sp of pagesJson.subPackages || []) {
  for (const p of sp.pages || []) {
    registered.add(`${sp.root}/${p.path}`);
  }
}

// 全部静态项（动态分类 items 运行时生成，不参与静态断言）
const staticItems = LINK_CATALOG.filter((c) => !c.dynamic).flatMap((c) =>
  c.items.map((it) => ({ cat: c.name, ...it }))
);

describe('linkCatalog 根因修复：个人中心路径', () => {
  test('个人中心 = /pages/card/profile（曾误写 cardMain/home 与首页互染）', () => {
    const it = staticItems.find((x) => x.label === '个人中心');
    expect(it, '「个人中心」项应存在').toBeTruthy();
    expect(it.value).toBe('/pages/card/profile');
  });
  test('「页面」分类内不再有与「首页」同 value 的项', () => {
    const pageCat = LINK_CATALOG.find((c) => c.name === '页面');
    const homeVal = pageCat.items.find((x) => x.label === '首页').value;
    const dupes = pageCat.items.filter((x) => x.value === homeVal);
    expect(dupes.map((x) => x.label)).toEqual(['首页']);
  });
});

describe('linkCatalog 数据完整性', () => {
  test('每个静态项都有 label/value/key', () => {
    for (const it of staticItems) {
      expect(it.label, `${it.cat} 存在缺 label 的项`).toBeTruthy();
      expect(it.value, `${it.cat}/${it.label} 缺 value`).toBeTruthy();
      expect(it.key, `${it.cat}/${it.label} 缺 key`).toBeTruthy();
    }
  });
  test('key 全目录唯一（选中态与 v-for key 的地基）', () => {
    const keys = staticItems.map((it) => it.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, `重复 key: ${dupes.join(', ')}`).toEqual([]);
  });
  test('静态项 value 路径全部在 C 端 pages.json 注册（防写错路径）', () => {
    const missing = staticItems
      .map((it) => ({ ...it, path: it.value.replace(/^\//, '').split('?')[0] }))
      .filter((it) => !registered.has(it.path));
    expect(missing.map((x) => `${x.cat}/${x.label}: ${x.path}`), '存在未注册路径').toEqual([]);
  });
  test('同 value 的项 key 必须不同（智能名片首页/首页、会员中心/套餐与续费）', () => {
    const byValue = {};
    for (const it of staticItems) {
      (byValue[it.value] ||= []).push(it.key);
    }
    for (const [value, keys] of Object.entries(byValue)) {
      expect(new Set(keys).size, `${value} 有重复 key`).toBe(keys.length);
    }
    // 目录里确实存在同 value 对（设计上保留：不同分类/话术指向同一页面）
    expect(byValue['/pages/cardMain/home']).toHaveLength(2);
    expect(byValue['/pages/card/member']).toHaveLength(2);
    expect(byValue['/pages/card/profile']).toHaveLength(2);
  });
});

describe('LinkPicker 选中态机制', () => {
  test('列表 v-for key 用 it.key || it.value（不用裸 value）', () => {
    expect(pickerSrc).toContain(':key="it.key || it.value"');
  });
  test('选中态匹配用 pickKey === itemKey(it)（不用 pick === it.value）', () => {
    expect(pickerSrc).toContain(':class="{ active: pickKey === itemKey(it), disabled: it.disabled }"');
    expect(pickerSrc).toContain('<span v-if="pickKey === itemKey(it)" class="lk-check">✓</span>');
  });
  test('itemKey 回落 value（动态项无 key，动态 value 带唯一 id）', () => {
    expect(pickerSrc).toContain('function itemKey(it) { return it.key || it.value; }');
  });
  test('pickItem 同步维护 pick 与 pickKey', () => {
    expect(pickerSrc).toMatch(/pick\.value = it\.value;\s*\n\s*pickKey\.value = itemKey\(it\);/);
  });
  test('resolveLink 静态匹配时设 pickKey', () => {
    expect(pickerSrc).toContain('pickKey.value = itemKey(matched.it);');
  });
  test('confirm 仍 emit 路径值（下游组件零影响）', () => {
    expect(pickerSrc).toContain('return activeCat.value === CUSTOM_LINK.name ? customVal.value.trim() : pick.value;');
  });
});
