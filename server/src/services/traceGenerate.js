import { createRequire } from 'node:module';
import { computeTraceCode, canonicalBatchSegment } from './traceCode.js';

// 🔴 二维码生成依赖 qrcode（server/package.json 已有，是本仓库既有依赖）。
//    交付物原实现是 `<img src='./index.php?c=platform&a=url2qr&do=qr&url=...'>`
//    —— 本平台没有这个 PHP 端点 → 二维码 HTML 码型（2/4/13）下载下来全是裂图。
//    改用本地 qrcode 库生成 SVG data URI 内联进 HTML，导出文件自包含、离线可看。
const nodeRequire = createRequire(import.meta.url);
let QRCodeModule = null;
function qrSvgDataUri(text, modulePx = 4) {
  if (!QRCodeModule) QRCodeModule = nodeRequire('qrcode');
  const qr = QRCodeModule.create(String(text), { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (data[row * size + col]) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * modulePx}" height="${size * modulePx}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * 🔴 溯源查询页 URL（C 端唯一入口）。
 *
 * 交付物原实现指向 `${siteRoot}f.php?co=xxx&i=tenantId` —— 本平台没有 f.php。
 * 平台真实入口是 C 端 H5 的溯源页（web-app pages/trace/index）：
 *   {origin}/card/#/pages/trace/index?co=<防伪码>&tid=<租户ID>
 *
 * 🔴 必须是**绝对地址**：防伪码是印在包装上给消费者扫码的，
 *    相对路径（/card/#/...）被手机相机扫出来打不开。
 *    origin 取自请求头（req.protocol + req.get('host')），由调用方注入 ctx.origin。
 *    settings.siteroot 若配了绝对地址则优先用它（租户自有域名对外）。
 */
export function traceQueryUrl(ctx, code) {
  const siteRoot = String(ctx.siteRoot || '').trim();
  const origin = String(ctx.origin || '').trim();
  let base = '';
  if (/^https?:\/\//i.test(siteRoot)) {
    base = siteRoot.endsWith('/') ? siteRoot : `${siteRoot}/`;
  } else if (origin) {
    base = origin.endsWith('/') ? origin : `${origin}/`;
  } else {
    // 兜底：连 origin 都没有（单元测试直调 service）→ 用相对路径，至少不产出坏链接
    base = '/';
  }
  return `${base}card/#/pages/trace/index?co=${encodeURIComponent(code)}&tid=${ctx.tenantId}`;
}

function padNumber(value, width) {
  const w = Math.max(0, Number(width) || 0);
  return ('000000000000000000000000000000' + String(Math.max(0, Number(value) || 0))).slice(-w);
}

function zeros(width) {
  return '0'.repeat(Math.max(0, Number(width) || 0));
}

function wordwrap4(text) {
  return String(text).replace(/(.{4})/g, '$1 ').trim();
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

export function ruleParts(rule) {
  const m = rule?.m || {};
  return {
    prefix: String(m[1] ?? 'FW'),
    batchLen: Number(m[2] ?? 7),
    serialLen: Number(m[3] ?? 6),
    checkLen: Number(m[4] ?? 5),
    totalLen: Number(m[5] ?? 20),
  };
}

export function codeFromSerial(serial, batchNo, rule) {
  const p = ruleParts(rule);
  // 🔴 批次段必须走 canonicalBatchSegment（清洗 + 截断到 m[2] + 左补 0），
  //    与 verifyTraceCode → parseTraceCode 的切片口径完全一致；
  //    否则库里 '20261026'（8 位）与码里切出的 7 位 '2026102' 对不上 → 码永远失效。
  const aaa = p.prefix + canonicalBatchSegment(batchNo, rule) + padNumber(serial, p.serialLen) + zeros(p.checkLen);
  return computeTraceCode(aaa, rule);
}

/**
 * 纯文本码行。
 * 🔴 URL 码型（8/11/21）指向平台 C 端溯源页，不是原 PHP 的 f.php；
 *    12 型（原 p.url.cn 短链）也统一走同一入口 —— 平台没有短链服务。
 */
function normalLine(codetype, code, ctx, batch) {
  const url = traceQueryUrl(ctx, code);
  const p = ruleParts(ctx.rule);
  const noCheck = code.slice(0, code.length - p.checkLen);
  const check = code.slice(-p.checkLen);
  switch (Number(codetype)) {
    case 1: return `${wordwrap4(code)}\n`;
    case 3: return `${wordwrap4(code)}\r\n`;
    case 6:
    case 7: return `${code}\n`;
    case 8: return `${url}\r\n`;
    case 11: return `${url},${code}\n`;
    case 12: return `${url},${batch.batch}\n`;
    case 21: return `${traceQueryUrl(ctx, noCheck)},${check}\r\n`;
    default: return `${code}\n`;
  }
}

/**
 * 二维码 HTML 行。
 * 🔴 原实现是 `<img src='./index.php?c=platform&a=url2qr&do=qr&url=...'>`，
 *    本平台无此 PHP 端点 → 导出 HTML 全是裂图。改为本地 qrcode 库生成
 *    SVG data URI 内联，导出文件自包含（离线可看、可直接印）。
 */
function htmlQrLine(codetype, code, ctx, batch) {
  const target = traceQueryUrl(ctx, code);
  const svgUri = qrSvgDataUri(target);
  // 码面下方同时印出明文码：二维码扫不出（磨损/反光）时用户还能手输
  return `<div class="cell"><img src='${svgUri}' alt='${escapeHtml(code)}' /><div class="code">${escapeHtml(code)}</div></div>`;
}

function escapeHtml(text) {
  const s = String(text ?? '');
  // 用字符码构造实体，避免源码里出现 HTML 实体字面量（部分工具链会把它降级成裸字符）
  const AMP = String.fromCharCode(38);
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const QUOT = String.fromCharCode(34);
  const APOS = String.fromCharCode(39);
  return s
    .replace(new RegExp(AMP, 'g'), AMP + 'amp;')
    .replace(new RegExp(LT, 'g'), AMP + 'lt;')
    .replace(new RegExp(GT, 'g'), AMP + 'gt;')
    .replace(new RegExp(QUOT, 'g'), AMP + 'quot;')
    .replace(new RegExp(APOS, 'g'), AMP + '#39;');
}

/**
 * 二维码导出 HTML 骨架。
 * 🔴 交付物原版只吐一堆 <img> 片段、文件名还是 .txt → 双击打不开、打印排版也乱。
 *    这里补完整文档：内联样式 + 每行一个码格 + 页眉（批次/数量）。
 */
function htmlDocument(bodyHtml, prefix, batchNo) {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>防伪码 ${escapeHtml(prefix)}${escapeHtml(batchNo)}</title>`,
    '<style>',
    'body{margin:0;padding:24px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#1D2129}',
    'h1{font-size:18px;font-weight:600;margin:0 0 4px}',
    '.meta{font-size:13px;color:#86909C;margin:0 0 20px}',
    '.grid{display:flex;flex-wrap:wrap;gap:8px}',
    '.cell{width:200px;padding:6px;border:1px solid #E5E6EB;border-radius:6px;text-align:center;box-sizing:border-box;page-break-inside:avoid}',
    '.cell img{width:180px;height:180px;display:block}',
    '.code{font-size:11px;color:#4E5969;word-break:break-all;margin-top:4px;letter-spacing:.5px}',
    '</style>',
    '</head>',
    '<body>',
    `<h1>防伪码 ${escapeHtml(prefix)}${escapeHtml(batchNo)}</h1>`,
    `<p class="meta">批次 ${escapeHtml(prefix)}${escapeHtml(batchNo)}</p>`,
    `<div class="grid">${bodyHtml}</div>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * 套标行（14/15/16/17/22）。
 * 🔴 15/17/22 原本分别指向 f.php 与 p.url.cn —— 本平台无这两个端点，
 *    统一改走 C 端溯源页 URL。
 */
function setLine(codetype, row, code, ctx, batch) {
  const p = ruleParts(ctx.rule);
  const end = row[row.length - 1];
  const noCheck = p.prefix + end;
  const check = code.slice(-p.checkLen);
  const out = row.slice();
  switch (Number(codetype)) {
    case 14: out.push(wordwrap4(code)); break;
    case 15: out.push(traceQueryUrl(ctx, code)); break;
    case 16: out.push(code); break;
    case 17: out.push(`${traceQueryUrl(ctx, code)},${batch.batch}`); break;
    case 22:
      out.push(traceQueryUrl(ctx, noCheck));
      out.push(check);
      break;
    default: out.push(code); break;
  }
  return `${out.join(',')}\n`;
}

function deductCocom(db, tenantId, need) {
  const row = db.prepare('SELECT cocom FROM trace_settings WHERE tenant_id = ?').get(tenantId);
  const cocom = Number(row?.cocom ?? 0);
  if (cocom === -888) return { allowed: need, unlimited: true };
  if (cocom <= 0) throw new Error('防伪码库存不足，请先充值');
  const allowed = Math.min(need, cocom);
  const next = allowed === cocom ? 0 : cocom - allowed;
  db.prepare('UPDATE trace_settings SET cocom = ?, updated_at = datetime(\'now\') WHERE tenant_id = ?').run(next, tenantId);
  return { allowed, unlimited: false };
}

export function generateTracePackage({ db, tenantId, batch, rule, settings, codetype, codeno = 0, codenot = 0, siteRoot = '', origin = '' }) {
  const type = Number(codetype);
  const p = ruleParts(rule);
  const ctx = { tenantId, rule, siteRoot, origin };
  const htmlMode = type === 2 || type === 4 || type === 13;
  const setMode = [14, 15, 16, 17, 22].includes(type);

  if (!setMode) {
    let count = Math.min(10000, Math.max(1, Number(codeno) || 1));
    const need = count;
    const quota = deductCocom(db, tenantId, need);
    count = quota.allowed;
    const start = Number(batch.num || 0) + 1;
    let numbers = range(start, start + count - 1);
    if (String(settings.xiguang ?? '') !== '4') numbers = shuffle(numbers);
    let content = '';
    for (const serial of numbers) {
      const code = codeFromSerial(serial, batch.batch, rule);
      content += htmlMode ? htmlQrLine(type, code, ctx, batch) : normalLine(type, code, ctx, batch);
    }
    db.prepare('UPDATE trace_batches SET num = num + ?, leint = \'\', updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
      .run(count, tenantId, batch.id);
    // 🔴 二维码码型导出的是 HTML，文件名必须是 .html —— 交付物原版一律 .txt，
    //    浏览器打开会被当纯文本下载，用户双击打不开。二维码码型补完整 HTML 骨架。
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    if (htmlMode) content = htmlDocument(content, p.prefix, batch.batch);
    return {
      created: count,
      content,
      contentType: htmlMode ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      filename: htmlMode
        ? `securitycode_${p.prefix}${batch.batch}_${stamp}.html`
        : `securitycode_${p.prefix}${batch.batch}_${stamp}.txt`,
      ddtt: htmlMode ? 0 : 1,
    };
  }

  let sets = Math.min(100, Math.max(1, Number(codenot) || Number(codeno) || 1));
  const tbb = batch.bbox ? String(batch.bbox).length : 0;
  const tbs = batch.sbox ? String(batch.sbox).length : 0;
  const beis = Math.max(1, Number(batch.bbox || 1)) * Math.max(1, Number(batch.sbox || 1));
  const quota = deductCocom(db, tenantId, sets * beis);
  sets = Math.floor(quota.allowed / beis);
  if (sets <= 0) throw new Error('防伪码库存不足，无法生成套标');
  // 🔴 套标（14/15/16/17/22）也是码，批次段同样必须走 canonicalBatchSegment，
  //    否则套标印出来的一行里批次段与单码口径不同 → 扫不出批次。
  const batchSeg = canonicalBatchSegment(batch.batch, rule);
  const bl = p.serialLen - tbb - tbs;
  const llb = zeros(tbs);
  const llt = zeros(tbb + tbs);
  const rows = [];
  const start = Number(batch.tnum || 0) + 1;
  for (const j of range(start, start + sets - 1)) {
    const pt = batchSeg + padNumber(j, bl);
    if (tbb > 0) {
      for (const t of range(1, Number(batch.bbox))) {
        const pb = pt + padNumber(t, tbb);
        for (const i of range(1, Number(batch.sbox))) rows.push([pt + llt, pb + llb, pb + padNumber(i, tbs)]);
      }
    } else {
      for (const i of range(1, Number(batch.sbox))) rows.push([pt + llb, pt + padNumber(i, tbs)]);
    }
  }
  let content = '';
  for (const row of rows) {
    const code = codeFromSerial(row[row.length - 1].slice(batchSeg.length), batchSeg, rule);
    content += setLine(type, row, code, ctx, batch);
  }
  db.prepare('UPDATE trace_batches SET num = num + ?, tnum = tnum + ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
    .run(rows.length, sets, tenantId, batch.id);
  return {
    created: rows.length,
    sets,
    content,
    contentType: 'text/plain; charset=utf-8',
    filename: `securitycode_set_${p.prefix}${batch.batch}_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.txt`,
    ddtt: 1,
  };
}
