import { test } from 'node:test';
import assert from 'node:assert';
import { SLOTMAX, SLOTWHEN, normalizeDisplaySlots, pickDisplaySlots } from '../src/services/traceSlots.js';

// ============================================================
// 首页展示位纯函数（数量上限 / 展示条件 / 渲染挑选）
// 🔴 数量上限 8 的依据是公众号当前「上传图文消息素材」接口
//    （一个图文消息支持 1 到 8 条图文），不是对标站的固定 10 位。
// ============================================================

function slot(when, extra = {}) {
  return { when, title: 't', cover: '', link: '', color: '', ...extra };
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

test('颜色：非法抛', () => {
  assert.throws(() => normalizeOne({ color: 'red' }), /颜色必须是/);
});

test('颜色：#rgb / #rrggbb 通过、空串放行（空串 = 交给 C 端主题色）', () => {
  assert.equal(normalizeOne({ color: '#fff' }).color, '#fff');
  assert.equal(normalizeOne({ color: '#ff00ff' }).color, '#ff00ff');
  assert.equal(normalizeOne({ color: '' }).color, '');
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
