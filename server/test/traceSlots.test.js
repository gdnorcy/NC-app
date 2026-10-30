import { test } from 'node:test';
import assert from 'node:assert';
import {
  SLOTMAX, SLOTWHEN, normalizeDisplaySlots, pickDisplaySlots, slotsEnabled, substituteSlotPlaceholders,
} from '../src/services/traceSlots.js';

// ============================================================
// 首页展示位纯函数（数量上限 / 展示条件 / 渲染挑选 / 总开关 / 占位符）
// 🔴 数量上限 8 是**我们自定的产品上限**（参照素材接口 1~8 条的素材口径），
//    **不是**微信被动回复的上限 —— 被动回复图文只能 1 条（wx-mp.js 里硬截断）。
// ============================================================

function slot(when, extra = {}) {
  return { when, title: 't', cover: '', link: '', ...extra };
}

function normalizeOne(extra) {
  return normalizeDisplaySlots([slot(1, extra)])[0];
}

const VALIDWHENS = [0, 1, 2, 4, 5];

test('数量上限 8：正好 8 个通过', () => {
  // 🔴 轮转只用五个合法展示条件 —— 用 i%6 会撞上非法值 3，
  //    那测的是「非法值抛」而不是「上限」，两个语义会互相掩盖。
  const list = Array.from({ length: SLOTMAX }, (_, i) => slot(VALIDWHENS[i % VALIDWHENS.length]));
  assert.equal(normalizeDisplaySlots(list).length, 8);
});

test('数量上限 8：第 9 个抛（不做静默截断）', () => {
  const list = Array.from({ length: 9 }, () => slot(1));
  assert.throws(() => normalizeDisplaySlots(list), /最多 8 个/);
});

test('展示条件非法一律抛（0/1/2/4/5 之外）', () => {
  for (const bad of [3, 6, 7, 9, -1, 99]) {
  assert.throws(() => normalizeDisplaySlots([slot(bad)]), /展示条件非法/, `when=${bad} 应抛`);
  }
});

test('五个合法展示条件全部收（含 0 关闭）', () => {
  assert.deepEqual(normalizeDisplaySlots(VALIDWHENS.map((w) => slot(w))).map((s) => s.when), VALIDWHENS);
});

test('接口密钥不透明透传：原样保留、且不被校验/解密', () => {
  const out = normalizeOne({ keyCipher: 'C_IPHER-不透明' });
  assert.equal(out.keyCipher, 'C_IPHER-不透明');
  // 非字符串形态一律不带上（防把密文对象/明文混进配置）
  const badKey = normalizeOne({ keyCipher: 123 });
  assert.equal(Object.prototype.hasOwnProperty.call(badKey, 'keyCipher'), false);
});

test('渲染挑选：OFF 恒不渲染、ALL 恒渲染', () => {
  const off = pickDisplaySlots([slot(SLOTWHEN.OFF)], { isFirstQuery: true, isTopQueryer: true });
  assert.equal(off.length, 0);
  const all = pickDisplaySlots([slot(SLOTWHEN.ALL)], { isFirstQuery: false, isTopQueryer: false });
  assert.equal(all.length, 1);
});

test('渲染挑选：首次/首位每次/非首位 三态各自正确', () => {
  const list = [slot(SLOTWHEN.FIRST), slot(SLOTWHEN.TOP_EVERY), slot(SLOTWHEN.NOT_TOP)];
  // 非首次 + 是首位 → 只渲染「首位每次」（「非首位」正确地不渲染）
  const mid = pickDisplaySlots(list, { isFirstQuery: false, isTopQueryer: true });
  assert.equal(mid.length, 1);
  assert.equal(mid[0].when, SLOTWHEN.TOP_EVERY);
  // 是首次 + 非首位 → 渲染「首次」与「非首位」
  const last = pickDisplaySlots(list, { isFirstQuery: true, isTopQueryer: false });
  assert.deepEqual(last.map((s) => s.when), [SLOTWHEN.FIRST, SLOTWHEN.NOT_TOP]);
  // 既首次又首位 → 「非首位」因 !isTop 而正确地不渲染 → 是 2 个不是 3 个。

 //    （这条曾写错过：把"是首位"时 NOT_TOP 也渲染当成期望。语义上「非首位」必须排他。）
  assert.equal(pickDisplaySlots(list, { isFirstQuery: true, isTopQueryer: true }).length, 2);
});

test('渲染挑选保持配置顺序（不做排序/去重）', () => {
  const list = [slot(SLOTWHEN.ALL, { title: 'b' }), slot(SLOTWHEN.ALL, { title: 'a' })];
  assert.deepEqual(pickDisplaySlots(list, {}).map((s) => s.title), ['b', 'a']);
});

// ============================================================
// 单个位隐藏开关（hidden）
// 🔴 与 when 的语义必须分清：when=0 是「本条件下不展示」（按查询态挑），
//    hidden=1 是「这个位整个关掉」（与查询态无关，配置层就藏起来）。
// ============================================================

test('隐藏开关：hidden=1 的位在任何查询态下都不渲染', () => {
  const list = [slot(SLOTWHEN.ALL, { title: '隐藏位', hidden: 1 }), slot(SLOTWHEN.ALL, { title: '正常位' })];
  const out = pickDisplaySlots(list, { isFirstQuery: true, isTopQueryer: true });
  assert.deepEqual(out.map((s) => s.title), ['正常位']);
});

test('隐藏开关：hidden 与 when 是两道独立闸门（都过才渲染）', () => {
  // 隐藏位即便 when=ALL 也不渲染
  assert.equal(pickDisplaySlots([slot(SLOTWHEN.ALL, { hidden: 1 })], { isFirstQuery: true }).length, 0);
  // 未隐藏但 when=OFF 也不渲染
  assert.equal(pickDisplaySlots([slot(SLOTWHEN.OFF, { hidden: 0 })], { isFirstQuery: true }).length, 0);
});

test('隐藏开关：归一化后只有 0/1 两态（脏值一律当未隐藏）', () => {
  assert.equal(normalizeOne({ hidden: 1 }).hidden, 1);
  assert.equal(normalizeOne({ hidden: 0 }).hidden, 0);
  assert.equal(normalizeOne({ hidden: 'yes' }).hidden, 0);
  assert.equal(normalizeOne({}).hidden, 0, '缺省必须是未隐藏（老配置没有这个字段）');
});

// ============================================================
// 展示位总开关（settings.slotsEnabled）
// ============================================================

test('展示位总开关：缺省 = 开（老租户库里没有这个字段，不能一上线就全关）', () => {
  assert.equal(slotsEnabled({}), true);
  assert.equal(slotsEnabled({ slotsEnabled: undefined }), true);
  assert.equal(slotsEnabled({ slotsEnabled: null }), true);
  assert.equal(slotsEnabled({ slotsEnabled: '' }), true);
});

test('展示位总开关：显式 0 = 关，其余一律视为开', () => {
  assert.equal(slotsEnabled({ slotsEnabled: 0 }), false);
  assert.equal(slotsEnabled({ slotsEnabled: '0' }), false);
  assert.equal(slotsEnabled({ slotsEnabled: 1 }), true);
  assert.equal(slotsEnabled({ slotsEnabled: '1' }), true);
});

// ============================================================
// 占位符替换（服务端唯一出处）
// ============================================================

test('占位符替换：{CODE}/{TID} 换成真实值（标题与链接同一口径）', () => {
  const out = substituteSlotPlaceholders('溯源 {CODE} 租户 {TID}', { code: 'FW123', tenantId: 7 });
  assert.equal(out, '溯源 FW123 租户 7');
});

test('占位符替换：没有占位符时原样返回（不吞字符）', () => {
  assert.equal(substituteSlotPlaceholders('https://x.com/p', { code: 'A', tenantId: 1 }), 'https://x.com/p');
  assert.equal(substituteSlotPlaceholders('', { code: 'A', tenantId: 1 }), '');
});
