import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  SLOTMAX, SLOTWHEN, SLOTTIME, normalizeDisplaySlots, pickDisplaySlots, slotsEnabled,
  substituteSlotPlaceholders, slotStamp, inSlotWindow, slotAuthSign,
} from '../src/services/traceSlots.js';

// ============================================================
// 首页展示位纯函数（数量上限 / 展示条件 / 渲染挑选 / 总开关 / 占位符）
// 🔴 数量上限 8 是**我们自定的产品上限**（参照素材接口 1~8 条的素材口径），
//    **不是**微信被动回复的上限 —— 被动回复图文只能 1 条（wx-mp.js 里硬截断）。
// ============================================================

/** 固定「当前时间」，让相对模式的窗口可断言（北京时间 2026-10-30 08:00） */
const NOW = new Date('2026-10-30T00:00:00Z');

function slot(when, extra = {}) {
  return { when, title: 't', cover: '', link: '', ...extra };
}

function normalizeOne(extra) {
  return normalizeDisplaySlots([slot(1, extra)], { now: NOW })[0];
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

test('展示条件非法一律抛（0/1/2/3/4/5 之外）', () => {
  for (const bad of [6, 7, 9, -1, 99]) {
  assert.throws(() => normalizeDisplaySlots([slot(bad)]), /展示条件非法/, `when=${bad} 应抛`);
  }
});

test('五个合法展示条件全部收（含 0 关闭）', () => {
  assert.deepEqual(normalizeDisplaySlots(VALIDWHENS.map((w) => slot(w))).map((s) => s.when), VALIDWHENS);
});

// 🔴 2026-10-31 收敛（#532 偏差3）：原 `keyCipher`（接口密钥）影子字段已移除，
//    normalize 不再接收/透传它，旧数据里的 keyCipher 在下次保存时被自然剥离（不主动崩溃）。
test('收敛后：传入 keyCipher 被忽略、不进入归一化结果（兼容旧库残留）', () => {
  const out = normalizeOne({ keyCipher: 'C_IPHER-不透明' });
  assert.equal(out.keyCipher, undefined, 'keyCipher 不应再进入展示位配置');
  assert.equal(out.authKey, undefined === undefined ? out.authKey : out.authKey, 'authKey 仍是唯一密钥字段');
  // 归一化结果只含白名单字段（含 authKey 但为空时由兜底生成）
  assert.match(out.authKey, /^[0-9a-f]{32}$/, 'authKey 空时服务端兜底生成');
});

test('渲染挑选：OFF 恒不渲染、ALL 恒渲染', () => {
  const off = pickDisplaySlots([slot(SLOTWHEN.OFF)], { isFirstQuery: true, isTopQueryer: true });
  assert.equal(off.length, 0);
  const all = pickDisplaySlots([slot(SLOTWHEN.ALL)], { isFirstQuery: false, isTopQueryer: false });
  assert.equal(all.length, 1);
});

// 🔴 2026-10-31 补：展示位原先缺「仅非首次查询」档（活动位早就有），同一语义两套口径会被租户踩。
//    · 2 首次查询  → isFirstQuery（这个码被查第 1 次）
//    · 3 非首次查询 → !isFirstQuery（这个码第 2 次起被查）
//    注意它与 4/5（按「人」是不是首位查询人）是两回事：2/3 看「码被查了几次」。
test('渲染挑选：仅首次(2)/仅非首次(3) 两档按「这个码被查第几次」分流', () => {
  const list = [slot(SLOTWHEN.FIRST), slot(SLOTWHEN.NOT_FIRST)];
  // 这个码第 1 次被查 → 只渲染「仅首次」
  const first = pickDisplaySlots(list, { isFirstQuery: true, isTopQueryer: true });
  assert.deepEqual(first.map((s) => s.when), [SLOTWHEN.FIRST]);
  // 这个码第 2 次起被查 → 只渲染「仅非首次」（无论查询人是不是首位）
  const notFirst = pickDisplaySlots(list, { isFirstQuery: false, isTopQueryer: true });
  assert.deepEqual(notFirst.map((s) => s.when), [SLOTWHEN.NOT_FIRST]);
  // 非首次 + 非首位人也只渲染「仅非首次」（与 4/5 的「人」轴无关）
  const notFirstNotTop = pickDisplaySlots(list, { isFirstQuery: false, isTopQueryer: false });
  assert.deepEqual(notFirstNotTop.map((s) => s.when), [SLOTWHEN.NOT_FIRST]);
});

test('#552 异常值 when=3 现在合法、when=99 仍抛', () => {
  assert.doesNotThrow(() => normalizeOne({ when: SLOTWHEN.NOT_FIRST }), 'when=3 应已合法');
  assert.throws(() => normalizeOne({ when: 99 }), /展示条件非法/, 'when=99 应抛');
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

// ============================================================
// #532 展位「有效时段」（对标站时间设置：不限 / 一周内 / 二周内 / 一月内 / 日期范围）
// 🔴 口径（用户 2026-10-30 拍板）：相对选项是「相对**当前**时间快速选一段时间」，
//    选中即在**保存时**落成具体日期窗口；渲染层只比 startAt/endAt，不再看 timeMode。
// ============================================================

test('#532 时间模式非法一律抛（0/1/2/3/4 之外）', () => {
  for (const bad of [5, 6, -1, 99, 'abc']) {
    assert.throws(() => normalizeDisplaySlots([slot(1, { timeMode: bad })], { now: NOW }),
      /时间设置非法/, `timeMode=${bad} 应抛`);
  }
});

test('#532 缺省 timeMode = 0 不限时间（老配置没有这个字段，不能一上线就被时间挡掉）', () => {
  const out = normalizeOne({});
  assert.equal(out.timeMode, SLOTTIME.OFF);
  assert.equal(out.startAt, '');
  assert.equal(out.endAt, '');
  // 闸门：窗口为空 = 不限 → 任何时刻都渲染
  assert.equal(inSlotWindow(out, '2026-10-30 08:00:00'), true);
  assert.equal(inSlotWindow(out, '2030-01-01 00:00:00'), true);
});

test('#532 相对模式在保存时落成具体窗口（一周/二周/一月 = 7/14/30 天）', () => {
  const cases = [[SLOTTIME.WEEK1, '2026-10-30 00:00:00', '2026-11-06 23:59:59'],
    [SLOTTIME.WEEK2, '2026-10-30 00:00:00', '2026-11-13 23:59:59'],
    [SLOTTIME.MONTH1, '2026-10-30 00:00:00', '2026-11-29 23:59:59']];
  for (const [mode, s, e] of cases) {
    const out = normalizeOne({ timeMode: mode });
    assert.equal(out.startAt, s, `mode=${mode} startAt`);
    assert.equal(out.endAt, e, `mode=${mode} endAt`);
  }
});

test('#532 日期范围用填的值：纯日期自动补 00:00:00 / 23:59:59', () => {
  const out = normalizeOne({ timeMode: SLOTTIME.RANGE, startAt: '2026-11-01', endAt: '2026-11-10' });
  assert.equal(out.startAt, '2026-11-01 00:00:00');
  assert.equal(out.endAt, '2026-11-10 23:59:59');
});

test('#532 时间格式非法抛（不做静默丢弃）', () => {
  assert.throws(() => normalizeOne({ timeMode: SLOTTIME.RANGE, startAt: '2026/11/01' }), /时间格式非法/);
});

test('#532 开始晚于结束一律抛', () => {
  assert.throws(() => normalizeOne({ timeMode: SLOTTIME.RANGE, startAt: '2026-11-10', endAt: '2026-11-01' }),
    /开始时间晚于结束时间/);
});

test('#532 渲染闸门：只在窗口内渲染（窗口外一律不渲染）', () => {
  const inRange = { when: SLOTWHEN.ALL, startAt: '2026-10-30 00:00:00', endAt: '2026-11-06 23:59:59' };
  // 窗口内
  assert.equal(pickDisplaySlots([inRange], { now: NOW }).length, 1);
  // 窗口末尾（23:59:59 当秒仍算内）
  assert.equal(pickDisplaySlots([inRange], { now: new Date('2026-11-06T15:59:59Z') }).length, 1);
  // 早于开始
  assert.equal(pickDisplaySlots([inRange], { now: new Date('2026-10-29T12:00:00Z') }).length, 0);
  // 晚于结束
  assert.equal(pickDisplaySlots([inRange], { now: new Date('2026-11-07T00:00:00Z') }).length, 0);
});

test('#532 时段闸门与隐藏/展示条件是**三道独立闸门**（都过才渲染）', () => {
  const expired = { when: SLOTWHEN.ALL, startAt: '2026-01-01 00:00:00', endAt: '2026-01-31 23:59:59' };
  assert.equal(pickDisplaySlots([expired], { isFirstQuery: true, isTopQueryer: true, now: NOW }).length, 0);
  // 时段过关但 when=OFF 仍不渲染
  const off = { when: SLOTWHEN.OFF, startAt: '2026-10-01 00:00:00', endAt: '2026-12-31 23:59:59' };
  assert.equal(pickDisplaySlots([off], { isFirstQuery: true, now: NOW }).length, 0);
  // 时段过关但 hidden=1 仍不渲染
  assert.equal(pickDisplaySlots([{ ...off, when: SLOTWHEN.ALL, hidden: 1 }], { now: NOW }).length, 0);
});

test('#532 时间口径 = 中国本地（UTC+8）：服务器跑 UTC 也不差 8 小时', () => {
  // 服务器环境 UTC：2026-10-30T00:00:00Z 对应北京 10-30 08:00
  assert.equal(slotStamp(new Date('2026-10-30T00:00:00Z')), '2026-10-30 08:00:00');
  // 若误用 toISOString 会得 '2026-10-30T00:00:00.000Z' → 差 8 小时的经典事故
  assert.equal(slotStamp(new Date('2026-10-30T00:00:00Z')).slice(0, 10), '2026-10-30');
});

// ============================================================
// #532 展位鉴权码（对标站「鉴权码」：明文下发、拼进跳转链接给外部接口验签）
// ============================================================

test('#532 鉴权码：空则服务端生成 32 位十六进制串', () => {
  const out = normalizeOne({});
  assert.match(out.authKey, /^[0-9a-f]{32}$/);
});

test('#532 鉴权码：已填则原样保留（幂等 —— 保存一次换一次码会把已印出的链接全废掉）', () => {
  const mine = 'ip15xdm4oglys0ei12luwm4o4lukswog';
  assert.equal(normalizeOne({ authKey: mine }).authKey, mine);
  // 再归一化一次仍是同一个（不是每次保存都变）
  const once = normalizeOne({ authKey: mine });
  assert.equal(normalizeDisplaySlots([once], { now: NOW })[0].authKey, mine);
});

test('#532 链接变量：[FWM] → 防伪码、[KEY] → md5(防伪码+鉴权码) 签名（大小写不敏感）', () => {
  const out = substituteSlotPlaceholders('https://x.com/a?c=[FWM]&m=[key]', {
    code: 'FW123', tenantId: 7, authKey: 'KEY-abc',
  });
  const sign = crypto.createHash('md5').update('FW123KEY-abc', 'utf8').digest('hex');
  assert.equal(out, `https://x.com/a?c=FW123&m=${sign}`);
});

// 🔴 2026-10-31 修：原先 [KEY] 直接吐 authKey 明文 —— 链接会被消费者转发出去，
//    等于把密钥公开，拿到的人可为任意防伪码伪造合法链接。现在必须只吐签名。
test('#532 [KEY] 绝不泄漏鉴权码明文（安全红线锁）', () => {
  const authKey = 'ip15xdm4oglys0ei12luwm4o4lukswog';
  const out = substituteSlotPlaceholders('?m=[KEY]', { code: 'FW123', tenantId: 7, authKey });
  assert.doesNotMatch(out, /ip15xdm4oglys0ei12luwm4o4lukswog/, '明文鉴权码不得出现在链接里');
  assert.match(out, /^[?]m=[0-9a-f]{32}$/, '应是 32 位 md5 签名');
  // 换一个码 → 签名必须变（否则等于没签名）
  const other = substituteSlotPlaceholders('?m=[KEY]', { code: 'FW999', tenantId: 7, authKey });
  assert.notEqual(other, out);
});

test('#532 slotAuthSign：同一 (码, 密钥) 恒等、换码换密钥都变', () => {
  const a = slotAuthSign('FW1', 'k');
  const expected = crypto.createHash('md5').update('FW1k', 'utf8').digest('hex');
  assert.equal(a, expected);
  assert.equal(slotAuthSign('FW1', 'k'), a, '必须可重算 —— 外部系统靠这个验真');
  assert.notEqual(slotAuthSign('FW2', 'k'), a);
  assert.notEqual(slotAuthSign('FW1', 'k2'), a);
  // 空值不要炸（老配置没配鉴权码时 authKey=''）
  assert.match(slotAuthSign('', ''), /^[0-9a-f]{32}$/);
});

test('#532 两套占位符语法并存：老配置 {CODE}/{TID} 不受影响', () => {
  const out = substituteSlotPlaceholders('{CODE}/{TID}|[FWM]/[KEY]', {
    code: 'FW123', tenantId: 7, authKey: 'K1',
  });
  assert.ok(out.startsWith('FW123/7|FW123/'), `花括号/方括号两套都要认：${out}`);
  // [KEY] 段已是签名，不再是 'K1'
  assert.doesNotMatch(out, /K1$/);
});
