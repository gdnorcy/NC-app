import { createRequire } from 'node:module';
import { computeTraceCode, canonicalBatchSegment, DEFAULT_CODESET, demoSerialBase, DEMO_SERIAL_RESERVED, serializeTraceRule } from './traceCode.js';
import { makeMultiZip } from './zip.js';

// 🔴 H1：二维码码型（2/4/13）单批次超过此阈值时，强制走 ZIP 分文件导出，
//    不再把所有 SVG 内联进单个巨型 HTML（10 万码单 HTML = 1.2GB / 67s，浏览器打不开）。
//    小批量仍走单 HTML，预览更友好。
const QR_ZIP_THRESHOLD = 2000;

// 🔴 二维码生成依赖 qrcode（server/package.json 已有，是本仓库既有依赖）。
//    交付物原实现是 `<img src='./index.php?c=platform&a=url2qr&do=qr&url=...'>`
//    —— 本平台没有这个 PHP 端点 → 二维码 HTML 码型（2/4/13）下载下来全是裂图。
//    改用本地 qrcode 库生成 SVG data URI 内联进 HTML，导出文件自包含、离线可看。
const nodeRequire = createRequire(import.meta.url);
let QRCodeModule = null;
function buildQrSvg(text, modulePx = 4) {
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * modulePx}" height="${size * modulePx}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function qrSvgDataUri(text, modulePx = 4) {
  return `data:image/svg+xml;base64,${Buffer.from(buildQrSvg(text, modulePx), 'utf8').toString('base64')}`;
}

/**
 * 🔴 H1：二维码大批量导出的「目录页」——放在 zip 根目录，引用 codes/ 下每码一张的 SVG，
 *    解压后离线可预览、可直接送印刷拼版（印刷厂要的是「一码一个图像文件」，不是一整个 HTML）。
 */
function buildQrIndexHtml({ prefix, batchNo, count, gridItems, demo, scanUrl }) {
  const title = `${demo ? DEMO_MARK : ''}防伪码二维码目录 ${prefix}${batchNo}`;
  const scanTip = scanUrl
    ? `<p class="tip">消费者扫码后打开：${escapeHtml(scanUrl)}<br>二维码下方同时印有防伪明文码，二维码磨损或反光时可手动输入查询。</p>`
    : '<p class="tip">⚠️ 扫码地址未配置为绝对地址，请先配置站点根域名再印刷。</p>';
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN"><head><meta charset="utf-8"/>',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#1D2129;padding:24px}',
    '.meta{font-size:13px;color:#86909C;margin:0 0 16px}',
    '.tip{font-size:12px;color:#4E5969;background:#F7F8FA;border:1px solid #E5E6EB;border-radius:6px;padding:8px 12px;margin:0 0 16px;word-break:break-all}',
    '.grid{display:flex;flex-wrap:wrap;gap:8px}',
    '.cell{width:200px;padding:6px;border:1px solid #E5E6EB;border-radius:6px;text-align:center;box-sizing:border-box;page-break-inside:avoid}',
    '.cell img{width:180px;height:180px;display:block}',
    '.code{font-size:11px;color:#4E5969;word-break:break-all;margin-top:4px;letter-spacing:.5px}',
    '</style></head><body>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="meta">共 ${count} 个码。每个码对应 codes/ 下的同名 SVG 文件，解压后离线可预览、可直接送印刷拼版。</p>`,
    scanTip,
    `<div class="grid">${gridItems.join('\n')}</div>`,
    '</body></html>',
  ].join('\n');
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

/**
 * 码包页面上给运营看的「扫码基址」（不含具体码值）。
 *
 * 🔴 必须与 traceQueryUrl **同源**：这里用另一套拼法就会出现
 *    「页面提示的地址」与「二维码实际指向的地址」不一致 → 提示反而误导人。
 *    故直接复用 traceQueryUrl 的判定，只把码值段换成示例。
 *
 * @returns {string} 绝对地址；取不到绝对地址时返回空串（调用方据此显示警示）
 */
function scanBaseOf(ctx) {
  const probe = traceQueryUrl(ctx, 'CODE');
  // traceQueryUrl 末尾是 ?co=CODE&tid=N → 截到 ? 前即基址
  const base = probe.split('?')[0];
  // 相对路径（以 / 开头）说明没配站点根域名 → 视为「未配置」，交给调用方显示警示
  return /^https?:\/\//i.test(base) ? base : '';
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
function htmlDocument(bodyHtml, prefix, batchNo, demo = false, scanUrl = '') {
  const title = `${demo ? DEMO_MARK : ''}防伪码 ${prefix}${batchNo}`;
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    'body{margin:0;padding:24px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#fff;color:#1D2129}',
    'h1{font-size:18px;font-weight:600;margin:0 0 4px}',
    '.meta{font-size:13px;color:#86909C;margin:0 0 20px}',
    '.demo-banner{margin:0 0 16px;padding:10px 14px;border:1px solid #F53F3F;border-radius:6px;background:#FFECE8;color:#CB2634;font-size:14px;font-weight:600}',
    '.scan-tip{margin:0 0 16px;padding:8px 12px;border:1px solid #E5E6EB;border-radius:6px;background:#F7F8FA;font-size:12px;color:#4E5969;word-break:break-all}',
    '.grid{display:flex;flex-wrap:wrap;gap:8px}',
    '.cell{width:200px;padding:6px;border:1px solid #E5E6EB;border-radius:6px;text-align:center;box-sizing:border-box;page-break-inside:avoid}',
    '.cell img{width:180px;height:180px;display:block}',
    '.code{font-size:11px;color:#4E5969;word-break:break-all;margin-top:4px;letter-spacing:.5px}',
    '</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    // 🔴 试印包必须一眼可辨：红色横幅 + 标题前缀，避免试印品混入正式流通。
    demo ? `<div class="demo-banner">${escapeHtml(DEMO_MARK)}本批次为试印码，仅用于印刷前验证，请勿作为正式防伪码对外流通</div>` : '',
    `<p class="meta">批次 ${escapeHtml(prefix)}${escapeHtml(batchNo)}</p>`,
    // 🔴 给运营看的「扫码地址」：URL 配错是印完才发现的事故（印 10 万个码，扫出来打不开 = 全废）。
    //    码包是运营自己下载的 → 在码包里把地址显式写出来，是成本最低的拦截点。
    scanUrl
      ? `<div class="scan-tip">扫码地址（消费者扫码后打开）：${escapeHtml(scanUrl)}<br>二维码下方同时印有防伪明文码，二维码磨损或反光时可手动输入查询。</div>`
      : '<div class="scan-tip">⚠️ 扫码地址未配置为绝对地址（缺少站点根域名），印出的二维码可能无法正常打开，请联系平台配置后再印刷。</div>',
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

/**
 * 🔴 正式印刷后锁死码制（对标系统的「印刷后 K1~K5 不可改」在此落地）。
 *
 * 触发时机：**只有正式生成/导出成功**才写。演示（试印）码不写 —— 试印的意义
 * 恰恰是「先印一小批看看效果，不满意就改码制」，锁了就失去意义。
 *
 * 锁的是「已印出去的码不能再失效」：k1~k4（校验密钥）与 m1~m5（码结构）一旦改动，
 * 已印刷的码要么验真失败、要么切不出批次号 → 消费者扫出来全是「不存在或已失效」。
 */
export function markTraceRulePrinted(db, tenantId) {
  // 🔴 必须「没有码制行也建一行」：老租户 / 直接建项目的租户可能没有 trace_code_rules 行，
  //    getRule 会回落到默认码表出码 —— 此时若只 UPDATE（影响 0 行）就永远不会锁，
  //    「改 k 让已印码全废」的漏洞照旧存在。兜底建行写默认码表，与 getRule 的回落口径一致。
  const rule = { k: { ...DEFAULT_CODESET.k }, m: { ...DEFAULT_CODESET.m }, s: 0, zdl: 10 };
  db.prepare(`INSERT INTO trace_code_rules (tenant_id, m1, rule_json, publish_no, is_confirmed, locked_at, created_at, updated_at)
    VALUES (?, ?, ?, '', 0, datetime('now'), datetime('now'), datetime('now'))
    ON CONFLICT(tenant_id) DO UPDATE SET
      locked_at = CASE WHEN locked_at = '' THEN datetime('now') ELSE locked_at END`)
    .run(Number(tenantId), String(rule.m[1]), serializeTraceRule(rule));
}

/** 试印/演示码的包面标注（后端唯一出处，前端与导出包共用同一串） */
export const DEMO_MARK = '【演示·试印】';

/**
 * 🔴 试印码的包面提示（文本码包头部一行 / HTML 码包顶部红条）。
 * 试印包一旦流入生产，扫码者看到的应该是「这是演示」，而不是一条看起来和正式码一样的正品。
 */
function demoNoticeText(count) {
  return `${DEMO_MARK}本文件为试印演示码（${count} 个），仅用于印刷前验证，请勿作为正式防伪码对外流通\n`;
}

export function generateTracePackage({ db, tenantId, batch, rule, settings, codetype, codeno = 0, codenot = 0, siteRoot = '', origin = '', demo = false, packageFormat = 'html' }) {
  const type = Number(codetype);
  const p = ruleParts(rule);
  const ctx = { tenantId, rule, siteRoot, origin };
  const htmlMode = type === 2 || type === 4 || type === 13;
  const setMode = [14, 15, 16, 17, 22].includes(type);
  // 🔴 试印模式：只接受布尔真值，避免 body 里传 "false" 字符串被当成真。
  const isDemo = demo === true || demo === 1 || demo === '1';

  if (!setMode) {
    const demoBase = demoSerialBase(rule);
    let count = Math.min(isDemo ? DEMO_SERIAL_RESERVED : 10000, Math.max(1, Number(codeno) || 1));
    let start = 0;
    if (isDemo) {
      // 🔴 试印码：不扣库存、不锁码制，只占流水号空间**顶部**的预留段。
      //    走预留段的唯一目的：同一个码值不会既出现在试印包、又出现在正式包里 ——
      //    否则试印品印出来扫上去与正式码无法区分，「试印」这件事就白做了。
      if (!demoBase) {
        throw new Error('当前码制的流水号长度过短（m3 ≤ 3），容不下试印号段，请把流水号长度调到 4 位以上再试印');
      }
      const used = Number(batch.demo_num || 0);
      if (used + count > DEMO_SERIAL_RESERVED) {
        throw new Error(`本批次试印码已达上限（${DEMO_SERIAL_RESERVED} 个），请新建批次或改用正式生成`);
      }
      start = demoBase + used;
    } else {
      const quota = deductCocom(db, tenantId, count);
      count = quota.allowed;
      start = Number(batch.num || 0) + 1;
      // 🔴 正式流水号不得侵入试印预留段：侵入后同一个流水号会同时出现在试印包与正式包里。
      if (demoBase && start + count - 1 >= demoBase) {
        throw new Error(`本批次已生成 ${Number(batch.num || 0)} 个码，流水号即将进入试印预留段（${demoBase} 起），请新建批次`);
      }
    }
    let numbers = range(start, start + count - 1);
    if (String(settings.xiguang ?? '') !== '4') numbers = shuffle(numbers);
    let content = '';
    let zipBuffer = null;
    // 🔴 H1：二维码码型（2/4/13）大批量导出改为「ZIP 内每码一张 SVG + 目录页 + 清单」，
    //    而不是把所有 SVG 内联进单个巨型 HTML。实测：单 HTML 内联 10 万码 = 1.2GB / 67s 单请求、
    //    浏览器排版软件打不开；ZIP 分文件后体积约降到 1/10、可断点、印刷厂可直接拿每码一张 SVG 拼版。
    //    触发：显式 format=zip，或单批次数量 >= QR_ZIP_THRESHOLD。小批量仍走单 HTML，预览更友好。
    const qrZip = htmlMode && (packageFormat === 'zip' || count >= QR_ZIP_THRESHOLD);
    if (htmlMode && qrZip) {
      const svgEntries = [];
      const gridItems = [];
      let manifest = 'code,url\n';
      numbers.forEach((serial, idx) => {
        const code = codeFromSerial(serial, batch.batch, rule);
        const url = traceQueryUrl(ctx, code);
        const svgName = `${String(idx + 1).padStart(6, '0')}.svg`;
        svgEntries.push({ name: `codes/${svgName}`, data: buildQrSvg(url, 4) });
        gridItems.push(`<div class="cell"><img src="codes/${svgName}"/><div class="code">${escapeHtml(code)}</div></div>`);
        manifest += `${code},${url}\n`;
      });
      const indexHtml = buildQrIndexHtml({ prefix: p.prefix, batchNo: batch.batch, count: numbers.length, gridItems, demo: isDemo, scanUrl: scanBaseOf(ctx) });
      svgEntries.push({ name: 'index.html', data: indexHtml });
      svgEntries.push({ name: 'manifest.csv', data: manifest });
      zipBuffer = makeMultiZip(svgEntries);
    } else {
      for (const serial of numbers) {
        const code = codeFromSerial(serial, batch.batch, rule);
        content += htmlMode ? htmlQrLine(type, code, ctx, batch) : normalLine(type, code, ctx, batch);
      }
    }
    if (isDemo) {
      // 🔴 试印码只累加 demo_num：不占正式库存、不进正式统计、不触发结构锁。
      db.prepare('UPDATE trace_batches SET demo_num = demo_num + ?, leint = \'\', updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
        .run(count, tenantId, batch.id);
    } else {
      db.prepare('UPDATE trace_batches SET num = num + ?, leint = \'\', updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
        .run(count, tenantId, batch.id);
      // 🔴 P0：正式印刷成功即锁死码制（k1~k4 密钥与 m1~m5 结构都不可再改）。
      //    锁在**生成成功之后**写：生成失败（库存不足 / 码长不自洽）不该把租户锁死。
      markTraceRulePrinted(db, tenantId);
    }
    // 🔴 二维码码型导出的是 HTML，文件名必须是 .html —— 交付物原版一律 .txt，
    //    浏览器打开会被当纯文本下载，用户双击打不开。二维码码型补完整 HTML 骨架。
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    if (isDemo) {
      if (htmlMode && zipBuffer) {
        return { created: count, demo: true, content: zipBuffer, contentType: 'application/zip', filename: `democode_${p.prefix}${batch.batch}_${stamp}.zip`, isBuffer: true, ddtt: 0 };
      }
      if (htmlMode) content = htmlDocument(content, p.prefix, batch.batch, true, scanBaseOf(ctx));
      else content = demoNoticeText(count) + content;
    } else if (htmlMode) {
      if (zipBuffer) {
        return { created: count, demo: false, content: zipBuffer, contentType: 'application/zip', filename: `securitycode_${p.prefix}${batch.batch}_${stamp}.zip`, isBuffer: true, ddtt: 0 };
      }
      content = htmlDocument(content, p.prefix, batch.batch, false, scanBaseOf(ctx));
    }
    return {
      created: count,
      demo: isDemo,
      content,
      contentType: htmlMode ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      filename: htmlMode
        ? `${isDemo ? 'democode' : 'securitycode'}_${p.prefix}${batch.batch}_${stamp}.html`
        : `${isDemo ? 'democode' : 'securitycode'}_${p.prefix}${batch.batch}_${stamp}.txt`,
      ddtt: htmlMode ? 0 : 1,
    };
  }

  // 🔴 试印模式不覆盖套标：套标的「套号 + 子码」结构与试印号段（流水号顶部预留段）
  //    不同构，硬套会让套标的流水号落在正式段里、与正式套标撞号。直接拒绝并说明。
  if (isDemo) {
    throw new Error('试印模式仅支持单码码型（普通文本码 / 二维码码包 / 纯数字码），套标码型请使用正式生成');
  }

  // 🔴 H3：套标码型（14/15/16/17/22）必须先配置批次的「套数量(bbox)」与「子码数量(sbox)」。
  //    否则 beis = max(1,bbox||1)*max(1,sbox||1) 在两者为 0 时退化为 1，行构建循环
  //    range(1, bbox||1)=range(1,0)=[] / range(1, sbox||1)=[] → 静默产出 0 个码；
  //    若只配其一，应扣库存（sets*beis）与实产码数还会错位。明确报错比静默 0 码更安全。
  const bboxN = Number(batch.bbox || 0);
  const sboxN = Number(batch.sbox || 0);
  if (bboxN < 1 || sboxN < 1) {
    throw new Error('套标码型需要先设置批次的「套数量(bbox)」和「子码数量(sbox)」，当前批次未配置套标维度，无法生成套标码');
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
