const WI = [7, 19, 11, 5, 1, 2, 3, 7, 19, 13, 5, 3, 11, 2, 7, 13, 2, 5, 7, 3, 19, 17];
const WU = [5, 7, 13, 19, 7, 3, 2, 17, 5, 3, 7, 19, 7, 11, 3, 7, 2, 13, 1, 7, 11, 5];
const ZM = '38742938235627364287';

/**
 * 🔴 默认码制（租户未配置码制时的回落值，也是平台播种的初始码制）。
 *
 * k1..k4 各 10 位、k5 1 位；m1 前缀 2 位、m2 批次号 7 位、m3 流水号 6 位、
 * m4 校验位 5 位、m5 总长 20 位（2+7+6+5=20，码长自洽）。
 *
 * 🔴 为什么 k 码表绝不能为空：
 *   computeTraceCode 里 kk = (digitAt(b,i) + digitAt(pi,i)) * digitAt(pu,i) * 337。
 *   pi / pu 来自 k1+k3 / k2+k4，digitAt 对空串返回 0 → kk 恒为 0 →
 *   校验位变成与码内容无关的**常量** → 攻击者只要拿到任意一个真码，
 *   改掉流水号与批次号、保留原校验位就能通过验真（防伪码形同虚设）。
 *   所以 k 缺失必须回落这份默认码表，绝不允许空码表参与运算。
 */
export const DEFAULT_CODESET = {
  k: { 1: '0123456789', 2: '9876543210', 3: '1357924680', 4: '2468013579', 5: '7' },
  m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 },
  s: 0,
  zdl: 10,
};

function valueAt(obj, key, fallback = '') {
  if (!obj) return fallback;
  return obj[key] ?? obj[String(key)] ?? fallback;
}

function digitAt(text, index) {
  const ch = String(text ?? '')[index];
  const n = Number.parseInt(ch, 10);
  return Number.isFinite(n) ? n : 0;
}

function padLeftNumber(value, width, pad) {
  return (pad + String(value)).slice(-width);
}

export function cleanTraceCode(input) {
  return String(input ?? '')
    .replace(/－/g, '')
    .replace(/　/g, '')
    .replace(/-/g, '')
    .replace(/ /g, '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .toUpperCase();
}

export function computeTraceCode(input, codeset = {}) {
  const m = codeset.m || {};
  const k = codeset.k || {};
  const prefix = String(valueAt(m, 1, ''));
  const checkLen = Number(valueAt(m, 4, 5));
  const totalLen = Number(valueAt(m, 5, 20));
  const pi = String(valueAt(k, 1, '')) + String(valueAt(k, 3, ''));
  const pu = String(valueAt(k, 2, '')) + String(valueAt(k, 4, ''));
  const k5 = String(valueAt(k, 5, ''));
  const clean = cleanTraceCode(input);
  const bodyLen = Math.max(0, totalLen - checkLen - prefix.length);
  const body = clean.slice(prefix.length, prefix.length + bodyLen);
  const b = (body + k5 + ZM).slice(0, 20);

  let t = 0;
  for (let i = 0; i < b.length; i += 1) {
    const kk = (digitAt(b, i) + digitAt(pi, i)) * digitAt(pu, i) * 337;
    t += (kk + WI[i]) * WU[i];
  }

  let p;
  if (checkLen === 4) p = padLeftNumber(t % 887, 4, '00000');
  else if (checkLen === 5) p = padLeftNumber(t % 8893, 5, '000000');
  else if (checkLen === 6) p = padLeftNumber((t * t) % 78487, 6, '0000000');
  else if (checkLen === 7) p = padLeftNumber((t * t) % 938351, 7, '00000000');
  else p = padLeftNumber(t % 8893, 5, '000000');

  return prefix + body + p;
}

export function verifyTraceCode(input, codeset = {}) {
  const clean = cleanTraceCode(input);
  return computeTraceCode(clean, codeset) === clean;
}

export function parseTraceCode(input, codeset = {}) {
  const m = codeset.m || {};
  const code = cleanTraceCode(input);
  const prefix = String(valueAt(m, 1, ''));
  const batchLen = Number(valueAt(m, 2, 0));
  const checkLen = Number(valueAt(m, 4, 5));
  const totalLen = Number(valueAt(m, 5, code.length));
  const bodyLen = Math.max(0, totalLen - checkLen - prefix.length);
  const body = code.slice(prefix.length, prefix.length + bodyLen);
  return {
    code,
    prefix,
    body,
    batch: body.slice(0, batchLen),
    serial: body.slice(batchLen),
    checkLen,
    totalLen,
  };
}

export function buildTraceCodeFromSerial(batch, serial, codeset = {}) {
  const m = codeset.m || {};
  const prefix = String(valueAt(m, 1, ''));
  const checkLen = Number(valueAt(m, 4, 5));
  const totalLen = Number(valueAt(m, 5, 20));
  const bodyLen = Math.max(0, totalLen - checkLen - prefix.length);
  const serialLen = Math.max(0, bodyLen - batchLenOf(codeset));
  const safeBatch = canonicalBatchSegment(batch, codeset);
  const serialText = cleanTraceCode(serial).replace(/\D/g, '').slice(-serialLen).padStart(serialLen, '0');
  return computeTraceCode(prefix + safeBatch + serialText, codeset);
}

/** 码制里的「批次号长度」m[2]（缺省 7，与 db.js 播种的默认码制一致） */
export function batchLenOf(codeset = {}) {
  const m = codeset.m || {};
  const n = Number(valueAt(m, 2, 7));
  return Math.max(1, Number.isFinite(n) && n > 0 ? n : 7);
}

/**
 * 🔴 规范批次段（写入 / 生成 / 验证 三处必须同一口径）。
 *
 * 防伪码结构 = 前缀(m1) + 批次段(m2 位) + 流水号 + 校验位(m4 位)，总长 m5。
 * 其中「批次段」在码里的长度恒为 m[2]，而 verifyTraceCode 校验通过后
 * parseTraceCode 会按 m[2] 从码里切出批次段，再去 trace_batches.batch 精确匹配。
 *
 * 所以库里存的批次号如果宽度不等于 m[2]（历史数据、用户手输 8 位日期号等），
 * 生成的码切出来的批次段与库里那串就永远对不上 → 「防伪码不存在或已失效」。
 * 统一口径：清洗 → 截断到 m[2] → 左补 0 到 m[2]。
 */
export function canonicalBatchSegment(batch, codeset = {}) {
  const len = batchLenOf(codeset);
  return cleanTraceCode(batch).slice(0, len).padStart(len, '0');
}
