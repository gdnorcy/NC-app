// 小程序构建后瘦身：
//  - 剔除 H5 专用的 static/three（小程序端用 npm 的 threejs-miniprogram，此目录纯冗余）
//  - 剔除 H5 时代遗留、小程序端无源码引用的 static/icons（51 个 SVG）
//  - 剔除 static/sicons（gen-mp-sicons.js 的构建期 PNG 中间产物，运行时只用 base64 data URI）
// 用法：uni build -p mp-weixin 成功后执行（已挂进 web-app/package.json build:mp-weixin）
// 只影响小程序构建产物，不影响 H5 构建。
const fs = require('fs');
const path = require('path');

/**
 * 递归删除目录。
 *
 * 剔除失败不应中断整个构建——残留只会让包变大，不会破坏运行；
 * 因此吞掉异常并记录，最后统一告警，让人知道主包可能因此超标。
 */
function rmDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const mpDir = path.join(__dirname, '..', 'dist', 'build', 'mp-weixin');

// 剔除目录：**要么源码零引用，要么是刻意走网络、故意不进包**。
//
// 🔴🔴 2026-10-05 血的教训（`static/images`）：曾被列为「H5 时代遗留、小程序端无引用」
//   而整目录剔除，**但 `componentRegistry.js` 的倒计时 defaultProps 里就引用着它们**：
//     countdown   → countdown-banner.png（主图）+ countdown-bar.png（背景条）
//     countdown02 → countdown2-main.png（主图）+ countdown2-sub.jpg（两处子图）
//   这四个文件**新增倒计时组件时默认就会引用**，所以小程序端倒计时**一直图裂**
//   （表现被 `cdBgColor: 'rgba(0,0,0,0.4)'` 这类兜底色掩盖，容易误判成"正常"）。
//   只有 25KB，代价与收益完全不成比例 → **已从剔除名单移除。**
//
// 🔴 `static/sample`（2026-10-05，用户决定）：**组件的默认示例图**目录。
//   目录里现有 3 枚（banner 710×388 / square 400×400 / portrait 600×800，共约 100KB），
//   清单与「谁用哪枚」见 `web-app/src/utils/sampleImages.js`（唯一事实来源）。
//   它是**刻意走网络**的——运行时用 `assetUrl()` 拼绝对 URL，
//   真正托管在后端 `server/public/card/static/sample/`（H5 构建时由
//   `scripts/sync-mobile-dist.mjs` 同步过去），小程序包里**不需要**这份文件。
//   故剔除，与 `DesignPage.vue` 的 `NETWORK_ASSET_DIRS` 保持一致。
//
//   🔴 **用户明确要求：后续给任何组件加示例图，都必须走这个规范（网络图、不进包）**，
//      不要图省事直接 `import` 一张图进包。
//
//   ⚠️ 两条相反的规矩，别混：
//   - 剔除会让**包内引用**图裂 → 加进名单前grep 确认没人按包内路径用它
//   - 剔除会让**网络引用**少一份冗余备份（无妨）→ 前提是该资源确实已在后端托管
//     （新增示例图后要确认 `server/public/card/static/sample/` 里有对应文件）
const STRIP_DIRS = ['static/three', 'static/icons', 'static/sicons', 'static/sample'];

/** 收集产物里所有 js/wxml/json 文本文件 */
function collectCodeFiles() {
  const files = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|wxml|json)$/.test(name)) files.push(p);
    }
  })(mpDir);
  return files;
}

/**
 * 剔除后**自检**（不论删除成功还是失败都要跑）：
 * 扫产物代码，找出「仍引用 static 下资源、但该资源已不在产物里」的引用 → 打印告警。
 *
 * 🔴 2026-10-05：自检原先**只在剔除失败时触发**（因为当时恰好被 safe-delete 拦截才注意到），
 *   而实际上**剔除成功才是常态** —— 于是这个 bug 静默存在了 10 天没人发现。
 *   **判定条件必须是「代码引用了但文件不在」，不是「删除有没有报错」。**
 */
function warnIfReferencedAssetsDropped() {
  // 产物代码里出现的所有 static 相对路径（形如 static/images/xxx.png）
  const referenced = new Map(); // relPath -> [引用它的文件]
  const re = /static\/[A-Za-z0-9_\-./]+\.(?:png|jpe?g|gif|webp|svg|mp4)/g;
  for (const f of collectCodeFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      if (!referenced.has(m[0])) referenced.set(m[0], new Set());
      referenced.get(m[0]).add(path.relative(mpDir, f));
    }
  }
  // 刻意走网络、故意不进包的资源不算缺失（由后端 server/public 托管）。
  // 需与 DesignPage.vue 的 NETWORK_ASSET_DIRS 保持一致。
  const NETWORK_PREFIXES = ['static/sample/'];
  const isNetworkAsset = (rel) => NETWORK_PREFIXES.some((p) => rel.startsWith(p));
  const missing = [...referenced.entries()].filter(
    ([rel]) => !isNetworkAsset(rel) && !fs.existsSync(path.join(mpDir, rel))
  );
  const netAssets = [...referenced.keys()].filter(isNetworkAsset);

  // 🔴 2026-10-05 补：网络图**路径写错**同样会图裂，而上面的自检查不出来
  //   （它只判「文件在不在包里」，而网络图本来就不在包里 → 永远通过）。
  //   实例：`pages/panorama/index.vue` 曾写 `/static/sample/xxx.jpg`（漏 `/card` 前缀），
  //   后端实际托管在 `/card/static/sample/` → HTTP 404，且无任何构建期提示。
  //   判定：抽出的文件名能在 `src/static/` 找到（说明是本项目的资源、路径写错了），
  //   但产物里的引用路径**与源文件相对 src/static/ 的真实路径不一致** → 告警。
  const srcStatic = path.join(__dirname, '..', 'src', 'static');
  const realByName = new Map();
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const f = path.join(d, name);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (!realByName.has(name)) realByName.set(name, path.relative(srcStatic, f).split(path.sep).join('/'));
    }
  })(srcStatic);
  const pathMismatches = [];
  for (const rel of netAssets) {
    const name = rel.split('/').pop();
    const real = realByName.get(name);
    // 正确写法必须与源文件真实相对路径一致（含 card/ 前缀的挂载段）
    if (real && !rel.endsWith(real) && !rel.endsWith(real.replace(/^static\//, 'card/static/'))) {
      pathMismatches.push({ 引用: rel, 实际应为: real });
    }
  }

  if (!missing.length) {
    console.log(
      `[strip-mp-static] 自检：产物代码引用的 ${referenced.size} 个 static 资源均存在 ✓` +
        (netAssets.length ? `（另有 ${netAssets.length} 个走网络、不进包：${netAssets.join(', ')}）` : '')
    );
    if (pathMismatches.length) {
      console.warn(`[strip-mp-static] ⚠️ 发现 ${pathMismatches.length} 个网络图路径写错（后端会 404、真机图裂）：`);
      for (const m of pathMismatches) console.warn(`  产物里写的是 ${m.引用}  →  源文件实际在 ${m.实际应为}`);
      console.warn('[strip-mp-static]   → 用 utils/sampleImages.js 的 sampleUrl() 取路径，不要手写字符串');
    }
    return;
  }
  console.warn(`[strip-mp-static] ⚠️ 自检发现 ${missing.length} 个「代码引用但产物缺失」的静态资源（真机会图裂）：`);
  for (const [rel, files] of missing) {
    console.warn(`  ${rel}  ← 被 ${[...files].slice(0, 3).join(', ')} 引用`);
  }
  console.warn('[strip-mp-static]   → 要么把资源移出 STRIP_DIRS，要么从 defaultProps 里移除该默认图');
}

if (!fs.existsSync(mpDir)) {
  console.error('[strip-mp-static] 未找到小程序构建产物:', mpDir);
  process.exit(1);
}

const before = sizeK(mpDir);
let removedTotal = 0;
const failed = [];

for (const rel of STRIP_DIRS) {
  const dir = path.join(mpDir, rel);
  if (fs.existsSync(dir)) {
    const dirSize = sizeK(dir);
    // 部分运行环境（如带删除守卫的 CLI 沙箱）会在批量删除时抛错。
    // 剔除失败不应中断整个构建——残留只会让包变大，不会破坏运行；
    // 因此吞掉异常并记录，最后统一告警，让人知道主包可能因此超标。
    try {
      rmDir(dir);
      removedTotal += dirSize;
      console.log(`[strip-mp-static] 已剔除 ${rel}（${(dirSize / 1024).toFixed(0)}KB）`);
    } catch (e) {
      failed.push({ rel, dir, dirSize, msg: (e && e.message) || String(e) });
      console.warn(`[strip-mp-static] ⚠️剔除 ${rel} 失败：${(e && e.message) || e}`);
      console.warn(`[strip-mp-static]   残留路径 ${dir}（${(dirSize / 1024).toFixed(0)}KB），主包体积会因此偏大，请手动清理后重新构建`);
    }
  }
}

const after = sizeK(mpDir);
if (removedTotal > 0) {
  console.log(`[strip-mp-static] 小程序产物体积：${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB`);
} else {
  console.log('[strip-mp-static] 无可剔除目录');
}
if (failed.length) {
  console.warn(`[strip-mp-static] 有 ${failed.length} 个目录未能剔除，小程序主包可能超出 2MB 限制，请手动删除后重建`);
}
// 无论剔除成功还是失败都要自检（2026-10-05：静默图裂 10 天未被发现）
warnIfReferencedAssetsDropped();

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
