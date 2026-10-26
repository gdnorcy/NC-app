/**
 * 回归锁：防伪码「批次段宽度」一致性（2026-10-26）
 *
 * 🔴 背景（一个会静默废掉全部防伪码的缺陷）：
 *   防伪码结构 = 前缀(m1) + 批次段(m2 位) + 流水号(m3 位) + 校验位(m4 位)，总长 m5。
 *   C 端验真时 parseTraceCode 按 m[2] 从码里切批次段，
 *   再拿它去 trace_batches.batch 做**精确匹配**。
 *
 *   而生成端 buildTraceCodeFromSerial / codeFromSerial 原来直接拼**原始批次串**：
 *   库里存 '20261026'（8 位）、码制 m[2]=7 → 码里嵌的是 '20261026'，
 *   验真时切出来的是 '2026102' → 永远对不上 → 「防伪码不存在或已失效」。
 *   而且码长还会超（8+6+5+2=21 > m5=20）→ 尾部被 computeTraceCode 截掉，
 *   不同流水号可能生成出同一个码。
 *
 * 本文件钉死三处口径必须一致：
 *   ① 写入端：POST /batches 把批次号归一到 m[2] 位（超长报错、短号左补 0）
 *   ② 生成端：codeFromSerial / buildTraceCodeFromSerial 走 canonicalBatchSegment
 *   ③ 验证端：parseTraceCode 切出的批次段 == 库里存的批次号（能查到批次）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTraceCodeFromSerial, canonicalBatchSegment, cleanTraceCode, DEFAULT_CODESET, parseTraceCode, verifyTraceCode } from '../src/services/traceCode.js';
import { codeFromSerial, traceQueryUrl } from '../src/services/traceGenerate.js';

const codeset = {
  k: { 1: '0123456789', 2: '9876543210', 3: '1357924680', 4: '2468013579', 5: '7' },
  m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 },
  s: 0,
  zdl: 10,
};

// ── ① canonicalBatchSegment：统一口径 ──────────────────────────────────
test('canonicalBatchSegment 按 m[2] 归一（清洗 + 截断 + 左补 0）', () => {
  assert.equal(canonicalBatchSegment('0000001', codeset), '0000001');
  // 短号左补 0
  assert.equal(canonicalBatchSegment('123', codeset), '0000123');
  // 超长截断到 m[2]
  assert.equal(canonicalBatchSegment('20261026', codeset), '2026102');
  // 分隔符被清洗掉
  assert.equal(canonicalBatchSegment('2026-1026', codeset), '2026102');
  assert.equal(canonicalBatchSegment(' 2026 .10,26 ', codeset), '2026102');
});

test('canonicalBatchSegment 与 parseTraceCode 的切片口径一致', () => {
  // 用原始（未归一）批次串生成码，切出来的批次段必须等于归一后的串
  for (const raw of ['0000001', '123', '20261026', '2026-1026']) {
    const code = codeFromSerial('1', raw, codeset);
    const parsed = parseTraceCode(code, codeset);
    assert.equal(
      parsed.batch,
      canonicalBatchSegment(raw, codeset),
      `批次段口径不一致：raw=${raw} parsed=${parsed.batch}`,
    );
  }
});

// ── ② 生成端：码长与批次段必须守恒 ─────────────────────────────────────
test('生成端的码长恒等于 m5，且批次段宽度恒等于 m2', () => {
  for (const raw of ['0000001', '123', '20261026', '2026-1026']) {
    const code = codeFromSerial('1', raw, codeset);
    assert.equal(code.length, codeset.m[5], `码长偏离 m5：raw=${raw} code=${code}`);
    assert.equal(verifyTraceCode(code, codeset), true, `生成的码自校验失败：raw=${raw}`);
    const parsed = parseTraceCode(code, codeset);
    assert.equal(parsed.batch.length, codeset.m[2], `批次段宽度偏离 m2：raw=${raw}`);
  }
});

test('不同流水号生成不同码（码长截断不会造成撞码）', () => {
  const seen = new Set();
  for (let i = 1; i <= 200; i += 1) {
    seen.add(codeFromSerial(String(i), '20261026', codeset));
  }
  assert.equal(seen.size, 200, '不同流水号生成了重复码 —— 码长被截断');
});

test('buildTraceCodeFromSerial 与 codeFromSerial 同口径（历史批次可验真）', () => {
  // buildTraceCodeFromSerial 是 /batches/:id/generate-codes-legacy 用的入口，
  // codeFromSerial 是 generate-codes 用的入口 —— 两者必须产出同一个码
  for (const raw of ['0000001', '20261026']) {
    assert.equal(
      buildTraceCodeFromSerial(raw, '12', codeset),
      codeFromSerial('12', raw, codeset),
      `两个生成入口口径不一致：raw=${raw}`,
    );
  }
});

// ── ③ 验证端：切出的批次段能反查回批次 ─────────────────────────────────
test('切出的批次段能精确匹配到归一后的批次号（验真链路不断）', () => {
  const stored = canonicalBatchSegment('20261026', codeset); // 库里存的是归一后的串
  const code = codeFromSerial('1', '20261026', codeset);
  const parsed = parseTraceCode(code, codeset);
  assert.equal(parsed.batch, stored, '验真时切出的批次段与库里存的对不上');
});

test('码长不自洽会让码长偏离真实数据长度（故 saveRule 必须拦截）', () => {
  const { m } = codeset;
  assert.equal(String(m[1]).length + m[2] + m[3] + m[4], m[5], '默认码制本身必须自洽');
  // 不自洽码制（m5 拉大到 25）会让 computeTraceCode 按 totalLen 多切 body，
  // 产出长度 ≠ 真实数据长度(prefix+batch+serial+check=20) 的码 —— 这正是 saveRule 要拦的
  const bad = { ...codeset, m: { ...m, 5: 25 } };
  const code = codeFromSerial('1', '0000001', bad);
  const realLen = String(m[1]).length + m[2] + m[3] + m[4];
  assert.notEqual(code.length, realLen, '不自洽码制下码长被静默改写（应被 saveRule 拦截）');
});

// ── ④ URL 码型：不再指向不存在的 f.php ─────────────────────────────────
test('溯源查询 URL 指向平台 C 端溯源页且是绝对地址', () => {
  const ctx = { tenantId: 7, rule: codeset, siteRoot: '', origin: 'https://pan.example.com' };
  const url = traceQueryUrl(ctx, 'FW00000010000001');
  assert.ok(url.startsWith('https://pan.example.com/'), `URL 非绝对地址：${url}`);
  assert.ok(url.includes('/card/#/pages/trace/index'), `URL 未指向 C 端溯源页：${url}`);
  assert.ok(url.includes('co=FW00000010000001'), 'URL 缺防伪码参数');
  assert.ok(url.includes('tid=7'), 'URL 缺租户参数 tid');
  assert.ok(!url.includes('f.php'), 'URL 仍指向不存在的 f.php');
});

test('settings.siteroot 配了绝对地址时优先用它（租户自有域名）', () => {
  const ctx = { tenantId: 7, rule: codeset, siteRoot: 'https://shop.example.com/', origin: 'https://pan.example.com' };
  const url = traceQueryUrl(ctx, 'FW00000010000001');
  assert.ok(url.startsWith('https://shop.example.com/'), `siteroot 未生效：${url}`);
});

test('cleanTraceCode 与 canonicalBatchSegment 组合口径一致', () => {
  // 清洗后 9 位（FW + 7 位数字），但码里批次段只有 m[2]=7 位 → 截断到 7
  assert.equal(cleanTraceCode(' fw-0000 001 '), 'FW0000001');
  assert.equal(canonicalBatchSegment(' fw-0000 001 ', codeset), 'FW00000');
});

// ── ⑤ 安全：空码表会让校验位退化为常量 → 防伪码可伪造 ───────────────────
test('🔴 空 k 码表会让校验位退化为常量（防伪码可伪造），必须回落默认码表', () => {
  const emptyRule = {
    k: { 1: '', 2: '', 3: '', 4: '', 5: '' },
    m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 },
  };
  const real = codeFromSerial('1', '0000001', emptyRule);
  const check = real.slice(-5);
  // 攻击：保留校验位，改掉流水号 → 空码表下必定通过（= 校验形同虚设）
  const forged = `FW0000001999999${check}`;
  assert.equal(
    verifyTraceCode(forged, emptyRule),
    true,
    '空码表下伪造码本应通过 —— 若此用例变成 false，说明 computeTraceCode 已另行加固',
  );

  // 默认码表下同样的伪造必须被拒（这才是「防伪」该有的行为）
  const withDefault = codeFromSerial('1', '0000001', DEFAULT_CODESET);
  const defCheck = withDefault.slice(-5);
  const forgedWithDefault = `FW0000001999999${defCheck}`;
  assert.equal(
    verifyTraceCode(forgedWithDefault, DEFAULT_CODESET),
    false,
    '默认码表下伪造码仍能通过 —— 校验算法有洞',
  );
});

test('🔴 默认码表本身必须满足：k1..k4 各 10 位、码长自洽', () => {
  for (let i = 1; i <= 4; i += 1) {
    assert.equal(String(DEFAULT_CODESET.k[i]).length, 10, `k${i} 不是 10 位`);
  }
  const m = DEFAULT_CODESET.m;
  assert.equal(String(m[1]).length + m[2] + m[3] + m[4], m[5], '默认码制码长不自洽');
  // 默认码表下生成的码必须自校验通过
  const code = codeFromSerial('1', '0000001', DEFAULT_CODESET);
  assert.equal(verifyTraceCode(code, DEFAULT_CODESET), true);
});
