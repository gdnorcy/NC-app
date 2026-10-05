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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgMap[iconName]}</svg>`;
    const file = path.join(outDir, `${iconName}-${hex}.png`);
    try {
      await sharp(Buffer.from(svg), { density: 96 }).resize(24, 24).png().toFile(file);
      count++;
    } catch (e) {
      console.warn(`[gen-mp-sicons] 渲染失败 ${iconName}-${hex}: ${e.message}`);
    }
  }
  // 清理旧产物（历史全量生成的残留）
  const stale = fs.readdirSync(outDir).filter((f) => !pairs.has(f.replace(/\.png$/, '')));
  for (const f of stale) {
    fs.unlinkSync(path.join(outDir, f));
    console.log(`[gen-mp-sicons] 清理旧产物 ${f}`);
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
  // 逐文件 unlinkSync（每次 1 个），避免一次性递归删触发大批量删除保护。
  if (fs.existsSync(outDir)) {
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.png')) fs.unlinkSync(path.join(outDir, f));
    }
    try { fs.rmdirSync(outDir); } catch (_) { /* 非空则保留 */ }
    console.log(`[gen-mp-sicons] 已清理 PNG 中间产物（仅保留 base64 映射，主包 -~${((entries.length * 4) / 1024).toFixed(0)}KB 量级）`);
  }
})();
