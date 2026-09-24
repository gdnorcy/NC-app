// 小程序构建后瘦身：剔除 H5 专用的 static/three（小程序端用 npm 的 threejs-miniprogram，此目录纯冗余）
// 用法：uni build -p mp-weixin 成功后执行（已挂进 web-app/package.json build:mp-weixin）
// 只影响小程序构建产物，不影响 H5 构建。
const fs = require('fs');
const path = require('path');

const mpDir = path.join(__dirname, '..', 'dist', 'build', 'mp-weixin');
const threeDir = path.join(mpDir, 'static', 'three');

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

if (fs.existsSync(threeDir)) {
  fs.rmSync(threeDir, { recursive: true, force: true });
  const after = sizeK(mpDir);
  console.log(`[strip-mp-static] 已剔除 static/three（${((before - after) / 1024).toFixed(0)}KB）`);
  console.log(`[strip-mp-static] 小程序产物体积：${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB`);
} else {
  console.log('[strip-mp-static] static/three 不存在，无需剔除');
}
