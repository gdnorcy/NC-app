// 小程序端 SIcon 图标预生成：小程序 <image> 不支持 SVG data-URI（H5 的 view+background-image 在小程序端失效）
// 本脚本在 uni build -p mp-weixin 成功后，把 SIcon.vue 的 svgMap × 实际使用的颜色组合渲染成 PNG，
// 输出到 dist/build/mp-weixin/static/sicons/{name}-{hex}.png，供 SIcon.vue MP-WEIXIN 分支以 <image> 引用。
// 用法：已挂进 web-app/package.json build:mp-weixin（在 strip-mp-static 之后执行）
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

// 2) 收集实际使用颜色：扫描 src 下所有 .vue/.js/.ts 的 <SIcon ... color="...">，
//    提取属性值中出现的所有 #hex（含三元表达式如 active ? '#07c160' : '#9a9a9a'）
const colorSet = new Set();
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
        const colorAttr = tm[0].match(/color="([^"]*)"/);
        if (!colorAttr) continue;
        const hexRe = /#[0-9a-fA-F]{3,8}/g;
        let hm;
        while ((hm = hexRe.exec(colorAttr[1])) !== null) colorSet.add(hm[0].toLowerCase());
      }
    }
  }
}
walk(srcDir);
// 未显式传 color 时 SIcon 默认 currentColor，小程序无继承语境，统一按黑色生成兜底
colorSet.add('#000000');
const colors = [...colorSet];
console.log(`[gen-mp-sicons] 图标数=${Object.keys(svgMap).length}，颜色数=${colors.length}`);

// 3) 渲染 PNG
if (!fs.existsSync(mpDir)) {
  console.error('[gen-mp-sicons] 未找到小程序构建产物:', mpDir);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
(async () => {
  for (const name of Object.keys(svgMap)) {
    for (const hex of colors) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgMap[name]}</svg>`;
      const file = path.join(outDir, `${name}-${hex.replace('#', '')}.png`);
      try {
        await sharp(Buffer.from(svg), { density: 96 }).resize(24, 24).png().toFile(file);
        count++;
      } catch (e) {
        console.warn(`[gen-mp-sicons] 渲染失败 ${name}-${hex}: ${e.message}`);
      }
    }
  }
  console.log(`[gen-mp-sicons] 已生成 ${count} 个图标 PNG → ${path.relative(root, outDir)}`);
})();
