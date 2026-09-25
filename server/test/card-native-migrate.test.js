import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateNativeComponents, NATIVE_COMPONENT_TYPES } from '../src/utils/cardNativeMigrate.js';

function baseDesign() {
  return { components: [{ id: 't1', type: 'grid-nav', props: {} }], meta: { theme: {}, global: {} } };
}

test('无名片组件且无 nativeSections → 追加全部 5 个 native 组件（顺序 search/grid/mycard/radar/market）', () => {
  const j = migrateNativeComponents(baseDesign());
  const types = j.components.map((c) => c.type);
  assert.deepEqual(types, ['grid-nav', 'native-search', 'native-grid', 'native-mycard', 'native-radar', 'native-market']);
  assert.equal(j.components.find((c) => c.type === 'native-radar').props.showTitle, true);
  assert.equal(j.components.find((c) => c.type === 'native-market').props.marginBottom, 0);
});

test('nativeSections 部分关闭 → 对应模块不预置', () => {
  const j = baseDesign();
  j.meta.nativeSections = { searchBar: false, quickGrid: false, myCard: true, visitorRadar: true, peopleMarket: false };
  const migrated = migrateNativeComponents(j);
  const types = migrated.components.map((c) => c.type);
  assert.deepEqual(types, ['grid-nav', 'native-mycard', 'native-radar']);
});

test('已含任意 native 组件 → 幂等，不重复追加', () => {
  const j = baseDesign();
  j.components.push({ id: 'c-native-search', type: 'native-search', props: {} });
  const before = JSON.stringify(j);
  const migrated = migrateNativeComponents(j);
  assert.equal(JSON.stringify(migrated), before);
});

test('components 非数组 → 原样返回', () => {
  const j = { components: 'bad', meta: {} };
  assert.equal(migrateNativeComponents(j), j);
  const j2 = null;
  assert.equal(migrateNativeComponents(j2), j2);
});

test('NATIVE_COMPONENT_TYPES 导出完整', () => {
  assert.deepEqual(NATIVE_COMPONENT_TYPES, ['native-search', 'native-grid', 'native-mycard', 'native-radar', 'native-market']);
});
