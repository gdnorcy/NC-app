// 小程序构建后瘦身：
//  - 剔除 H5 专用的 static/three（小程序端用 npm 的 threejs-miniprogram，此目录纯冗余）
//  - 剔除 H5 时代遗留、小程序端无源码引用的 static/icons（51 个 SVG）与 static/images（4 个 png）
// 用法：uni build -p mp-weixin 成功后执行（已挂进 web-app/package.json build:mp-weixin）
// 只影响小程序构建产物，不影响 H5 构建。
const fs = require('fs');
const path = require('path');

const mpDir = path.join(__dirname, '..', 'dist', 'build', 'mp-weixin');
// 剔除目录：小程序端确定无引用（已核对源码 grep，勿随意追加——误删会破坏小程序资源）
const STRIP_DIRS = ['static/three', 'static/icons', 'static/images'];

function sizeK(dir) {
  let total = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else total += st.size;
    }
  };
  walk(dir);
  return total;
}

if (!fs.existsSync(mpDir)) {
  console.error('[strip-mp-static] 未找到小程序构建产物:', mpDir);
  process.exit(1);
}

const before = sizeK(mpDir);
let removedTotal = 0;

for (const rel of STRIP_DIRS) {
  const dir = path.join(mpDir, rel);
  if (fs.existsSync(dir)) {
    const dirSize = sizeK(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    removedTotal += dirSize;
    console.log(`[strip-mp-static] 已剔除 ${rel}（${(dirSize / 1024).toFixed(0)}KB）`);
  }
}

const after = sizeK(mpDir);
if (removedTotal > 0) {
  console.log(`[strip-mp-static] 小程序产物体积：${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB`);
} else {
  console.log('[strip-mp-static] 无可剔除目录');
}
