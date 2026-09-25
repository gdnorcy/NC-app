// 小程序端 SIcon 图标预生成：小程序 <image> 不支持 SVG data-URI（H5 的 view+background-image 在小程序端失效）
// 本脚本在 uni build -p mp-weixin 成功后，把 SIcon.vue 的 svgMap × 实际使用的颜色组合渲染成 PNG，
// 输出到 dist/build/mp-weixin/static/sicons/{name}-{hex}.png，供 SIcon.vue MP-WEIXIN 分支以 <image> 引用。
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
})();
