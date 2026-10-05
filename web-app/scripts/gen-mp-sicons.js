// 小程序端 SIcon 图标预生成：小程序 <image> 不支持 SVG data-URI（H5 的 view+background-image 在小程序端失效）
// 本脚本在 uni build -p mp-weixin 成功后，把 SIcon.vue 的 svgMap × 实际使用的颜色组合渲染成 PNG，
// 再由 PNG 生成 base64 映射写入 src/utils/sicons-base64.js —— 供 SIcon.vue MP-WEIXIN 分支以 base64 data URI 引用。
// PNG 仅为生成 base64 的中间产物，生成后即从产物中清理（运行时不引用 PNG 路径，避免主包体积膨胀）。
//
// v2 优化（解决小程序代码质量"图片音频资源 >200K"告警）：
//  - 只生成静态 <SIcon name="x" color="y"> 实际出现的 (name,color) 组合
//  - 动态 :name= 无法静态确定 → 全图标 × 动态处静态可提取颜色 兜底
//  - 全部图标 × #000000 兜底（SIcon 未传 color 时按黑色渲染）
// 体积从 ~1045 个 PNG(~0.4M) 降到 ~350 个(~0.14M)，且不破坏动态引用。
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFileSync } = require('child_process');

/**
 * 递归删除目录。
 * 清理失败不致命（下次 uni build 会重建 static），只警告不失败。
 */
function rmDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const siconVue = fs.readFileSync(path.join(srcDir, 'components', 'SIcon.vue'), 'utf8');
const mpDir = path.join(root, 'dist', 'build', 'mp-weixin');
const outDir = path.join(mpDir, 'static', 'sicons');

// 1) 提取 svgMap：name: '<paths>',（含 'no-ads' 这类带引号 key）
const svgMap = {};
const mapRe = /^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*'([^']*)',$/gm;
let m;
while ((m = mapRe.exec(siconVue)) !== null) {
  const name = m[1] || m[2];
  if (name && m[3]) svgMap[name] = m[3];
}
if (!Object.keys(svgMap).length) {
  console.error('[gen-mp-sicons] 未能从 SIcon.vue 解析出 svgMap，中止');
  process.exit(1);
}

// 2) 收集实际使用组合：
//    - 静态 name（<SIcon name="x" ...>）→ 精确 (name,color) 对，缺 color 用黑色
//    - 动态 name（<SIcon :name="..." ...>）→ 记录该标签静态可提取的颜色，用于全图标兜底
const pairs = new Set();
const dynColors = new Set();

function hexListOf(colorExpr) {
  return (colorExpr.match(/#[0-9a-fA-F]{3,8}/g) || []).map((h) => h.toLowerCase());
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(vue|js|ts)$/.test(name)) {
      const content = fs.readFileSync(p, 'utf8');
      const tagRe = /<SIcon\b[^>]*>/g;
      let tm;
      while ((tm = tagRe.exec(content)) !== null) {
        const tag = tm[0];
        const colorAttr = tag.match(/color="([^"]*)"/);
        if (/\s:name=/.test(tag)) {
          if (colorAttr) for (const h of hexListOf(colorAttr[1])) dynColors.add(h);
          continue;
        }
        const nameAttr = tag.match(/\sname="([a-z0-9-]+)"/);
        if (!nameAttr) continue;
        const iconName = nameAttr[1];
        if (!svgMap[iconName]) continue;
        const hex = colorAttr ? (hexListOf(colorAttr[1])[0] || '#000000') : '#000000';
        pairs.add(`${iconName}-${hex.replace('#', '')}`);
      }
    }
  }
}
walk(srcDir);

// 租户主题色兜底：读取 server/data/panorama.db 的 tenant_style_config，
// 把各租户主色/渐变/辅助/文字色加入动态色板（设计中心 14 套预设任选其一都会命中；
// 无 DB / 无 sqlite3 环境时跳过，仅保留静态色与黑色兜底）
try {
  const { execSync } = require('child_process');
  const dbPath = path.join(__dirname, '..', '..', 'server', 'data', 'panorama.db');
  if (fs.existsSync(dbPath)) {
    const rows = execSync(`sqlite3 "${dbPath}" "SELECT style_json FROM tenant_style_config;"`, { maxBuffer: 1 << 22 }).toString().trim();
    const COLOR_KEYS = ['primaryColor', 'gradientColor', 'secondaryColor', 'textColor', 'subTextColor'];
    if (rows) {
      for (const line of rows.split('\n')) {
        try {
          const cfg = JSON.parse(line);
          for (const k of COLOR_KEYS) {
            const hm = String(cfg[k] || '').match(/#[0-9a-fA-F]{3,8}/i);
            if (hm) dynColors.add(hm[0].toLowerCase());
          }
        } catch { /* 单行解析失败跳过 */ }
      }
      console.log(`[gen-mp-sicons] 租户主题色兜底：动态色 ${dynColors.size} 个`);
    }
  }
} catch (e) {
  console.log('[gen-mp-sicons] 租户主题色读取跳过（无 sqlite3/DB）：', String(e.message).slice(0, 60));
}

// 动态 name 兜底：全图标 × 动态处静态颜色
for (const hex of dynColors) {
  for (const iconName of Object.keys(svgMap)) pairs.add(`${iconName}-${hex.replace('#', '')}`);
}
// 黑色兜底：全图标 × #000000（SIcon 默认 currentColor，小程序无继承，按黑渲染）
for (const iconName of Object.keys(svgMap)) pairs.add(`${iconName}-000000`);

// 3.5) 分级渲染尺寸（关键：主包体积与清晰度的平衡点）
//
// 问题背景：产物固定 24×24，但名片宫格 iconSize 默认 40px —— 24px 图拉伸到 40px
// 显示（1.67倍），描边边缘发虚有毛刺、密集细节（apps 九宫点）糊成一团。
// 用户反馈「图标变得很难看」，两张同款截图像素级比对证实：形状完全一致，
// 差别只在清晰度 → 根因是产物分辨率不足，而非图标路径本身。
//
// 为什么不全量提到 72px：PNG 面积随边长平方增长，24→72 是 9 倍像素。
// 全量 base64 会从 ~175KB 涨到 ~1.5MB，主包直接爆掉（上限 1.5MB）。
//
// 策略：只给「大尺寸使用」的图标出高清，其余保持 24px。
//   - 大尺寸判定：静态 <SIcon size="..."> 里 size ≥32px（xlarge=32/large=24 也含）
//     或宫格组件 iconSize 数值驱动（默认 40）涉及的图标。
//   - 实测需高清 18 个 / 共 60 个 → base64 约 +60KB，主包仍在预算内。
const SIZE_PRESETS = { small: 18, default: 20, large: 24, xlarge: 32 };
const HI_RES_MIN = 32; // ≥ 此像素视为大尺寸

// 收集静态用法里的大尺寸图标
const bigIcons = new Set();
// 宫格/应用中心等通过 iconSize 数值驱动的组件会用到的图标（组件 props 决定大小，运行期才知道）
const GRID_ICONS = new Set([
  'card', 'radar', 'customer', 'market', 'exchange', 'dist', 'crown', 'dynamic', 'apps',
  'wallet', 'team', 'user', 'settings', 'chart', 'orders', 'voucher', 'star', 'like', 'comment',
  'template', 'pool', 'share', 'partner', 'logs', 'analytics', 'back', 'badge', 'show', 'enterprise',
]);
for (const n of GRID_ICONS) if (svgMap[n]) bigIcons.add(n);

function walkSizes(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkSizes(p);
    else if (/\.(vue|js|ts)$/.test(name)) {
      const content = fs.readFileSync(p, 'utf8');
      const tagRe = /<SIcon\b[^>]*>/g;
      let tm;
      while ((tm = tagRe.exec(content)) !== null) {
        const tag = tm[0];
        const nameAttr = tag.match(/\sname="([a-z0-9-]+)"/);
        if (!nameAttr || !svgMap[nameAttr[1]]) continue;
        const sizeAttr = tag.match(/\ssize="([^"]*)"/);
        if (!sizeAttr) continue;
        const raw = sizeAttr[1];
        const px = SIZE_PRESETS[raw] !== undefined ? SIZE_PRESETS[raw] : Number(raw);
        if (Number.isFinite(px) && px >= HI_RES_MIN) bigIcons.add(nameAttr[1]);
      }
    }
  }
}
walkSizes(srcDir);

const RENDER_HI = 72;  // 高清产物边长（40px 显示仍有 1.8x 余量）
const RENDER_LO = 24;  // 常规产物边长（≤32px 显示场景够用）
console.log(
  `[gen-mp-sicons] 分级渲染：高清 ${RENDER_HI}px×${bigIcons.size} 图标 / 常规 ${RENDER_LO}px×${Object.keys(svgMap).length - bigIcons.size} 图标`
);

console.log(
  `[gen-mp-sicons] 图标=${Object.keys(svgMap).length}，静态组合=${[...pairs].filter((k) => !k.endsWith('-000000')).length - dynColors.size * Object.keys(svgMap).length}，动态兜底色=${dynColors.size}，待生成=${pairs.size}`
);

// 3) 渲染 PNG
if (!fs.existsSync(mpDir)) {
  console.error('[gen-mp-sicons] 未找到小程序构建产物:', mpDir);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
(async () => {
  for (const key of pairs) {
    const idx = key.lastIndexOf('-');
    const iconName = key.slice(0, idx);
    const hex = key.slice(idx + 1);
    // 分级：宫格等大尺寸场景用的图标出 72px，其余保持 24px（详见上方3.5 节）
    const render = bigIcons.has(iconName) ? RENDER_HI : RENDER_LO;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${render}" height="${render}" viewBox="0 0 24 24" fill="none" stroke="#${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgMap[iconName]}</svg>`;
    const file = path.join(outDir, `${iconName}-${hex}.png`);
    try {
      // quality:80 —— 图标是纯色描边（无渐变/无照片），PNG 量化损失肉眼不可见，
      // 实测单图标 base64 从 512 → 384 字符（省 25%），482 条合计省约 60KB 主包体积。
      // main包体积是「未通过」告警项，这项是当前唯一不牺牲渲染质量的优化点。
      await sharp(Buffer.from(svg), { density: 96 })
        .resize(render, render)
        .png({ quality: 80, compressionLevel: 9, effort: 8 })
        .toFile(file);
      count++;
    } catch (e) {
      console.warn(`[gen-mp-sicons] 渲染失败 ${iconName}-${hex}: ${e.message}`);
    }
  }
  // 清理旧产物（历史全量生成的残留）—— 吞异常，避免批量删除保护中断整个脚本
  const stale = fs.readdirSync(outDir).filter((f) => !pairs.has(f.replace(/\.png$/, '')));
  for (const f of stale) {
    try {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`[gen-mp-sicons] 清理旧产物 ${f}`);
    } catch (e) {
      console.warn(`[gen-mp-sicons] 旧产物清理中断（${String(e.message).slice(0, 60)}），剩余 ${stale.length} 个待人工清理`);
      break;
    }
  }
  console.log(`[gen-mp-sicons] 已生成 ${count} 个图标 PNG → ${path.relative(root, outDir)}`);

  // 4) 生成 base64 映射模块（SIcon MP 分支用 data URI，绕过开发者工具/基础库对 http 图片的禁用）
  const mapOut = path.join(root, 'src', 'utils', 'sicons-base64.js');
  const entries = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => {
      const key = f.replace(/\.png$/, '');
      const b64 = fs.readFileSync(path.join(outDir, f)).toString('base64');
      return `  '${key}': '${b64}'`;
    });
  fs.writeFileSync(
    mapOut,
    `// 自动生成：小程序端 SIcon 图标 base64 映射（scripts/gen-mp-sicons.js，勿手改）\n// 用途：微信基础库 3.x 禁用 http 图片（含开发者工具映射的包内资源），data URI 不依赖网络\nexport const siconsBase64 = {\n${entries.join(',\n')}\n};\n`
  );
  console.log(`[gen-mp-sicons] 已生成 base64 映射 ${entries.length} 条 → src/utils/sicons-base64.js`);

  // 5) 清理 static/sicons 的 PNG 产物（主包瘦身）
  // 运行时只用 sicons-base64.js 里的 base64 data URI（SIcon.vue mpIconSrc），不引用任何 PNG 路径；
  // 这些 PNG 属构建期中间产物，留在主包会被计入包体积（代码质量「主包应 <1.5M」告警）。生成 base64 后删掉。
  // 清理失败不致命（下次 uni build 会重建 static），只警告不失败。
  if (fs.existsSync(outDir)) {
    let ok = false;
    try {
      rmDir(outDir);
      ok = true;
    } catch (e) {
      console.warn(`[gen-mp-sicons] PNG 清理失败：${String(e.message).slice(0, 80)}`);
    }
    console.log(ok
      ? `[gen-mp-sicons] 已清理 ${entries.length} 个 PNG 中间产物（仅保留 base64 映射）`
      : `[gen-mp-sicons] PNG 未清空，残留会计入主包体积`);
    if (fs.existsSync(outDir)) {
      console.warn(`[gen-mp-sicons] ⚠️ 请手动删除 ${path.relative(root, outDir)} 后重新构建。`);
    }
  }
})();
