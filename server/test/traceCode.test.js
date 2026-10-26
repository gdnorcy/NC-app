import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTraceCodeFromSerial, cleanTraceCode, computeTraceCode, parseTraceCode, verifyTraceCode } from '../src/services/traceCode.js';

const codeset = {
  k: { 1: '0123456789', 2: '9876543210', 3: '1357924680', 4: '2468013579', 5: '7' },
  m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 },
  s: 0,
  zdl: 10,
};

test('cleanTraceCode 按原 PHP 规则清洗', () => {
  assert.equal(cleanTraceCode(' fw-123 456.789,－　'), 'FW123456789');
});

test('compute/verify 自洽', () => {
  const code = computeTraceCode('FW00000010000001', codeset);
  assert.equal(code.length, 20);
  assert.equal(verifyTraceCode(code, codeset), true);
  assert.equal(verifyTraceCode(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'), codeset), false);
});

test('parseTraceCode 能拆出批次和流水号', () => {
  const code = buildTraceCodeFromSerial('0000001', '12', codeset);
  const parsed = parseTraceCode(code, codeset);
  assert.equal(parsed.prefix, 'FW');
  assert.equal(parsed.batch, '0000001');
  assert.equal(parsed.serial.slice(-2), '12');
});

test('buildTraceCodeFromSerial 生成的码可通过校验', () => {
  for (const serial of ['1', '2', '9999']) {
    const code = buildTraceCodeFromSerial('0000001', serial, codeset);
    assert.equal(verifyTraceCode(code, codeset), true);
  }
});
