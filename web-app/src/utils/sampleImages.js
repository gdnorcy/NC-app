/**
 * 装修组件的**内置示例图清单**（唯一事实来源，C 端 / admin 画布/ registry 共用）。
 *
 * 🔴 硬规范（2026-10-05 用户定，勿违反）：**示例图一律走网络图，不进小程序包。**
 *
 * 为什么不打包内：
 * - 示例图是「给运营看效果」的占位素材，不参与业务逻辑，只是纯体积负担。
 * - 打进包会占主包 2MB 额度（微信图片组件单文件走包内也需计体积）。
 *
 * 落地方式（两处必须同步，缺一处示例图就裂）：
 * 1. 源文件放`web-app/src/static/sample/`
 *    → H5 构建时由`scripts/sync-mobile-dist.mjs` 同步到
 *      `server/public/card/static/sample/`（**后端托管**）
 * 2. `scripts/strip-mp-static.js` 的 `STRIP_DIRS` **必须含 `static/sample`**
 *    → 保证它不进小程序产物（否则只是换了个名字，文件照样进包）
 * 3. 运行时用 `DesignPage.vue` 的 `assetUrl()` 拼绝对 URL
 *    → `NETWORK_ASSET_DIRS` 与脚本侧 `NETWORK_PREFIXES` 是配套的两份清单
 *
 * ⚠️ 代价（已知且接受）：**真机需在小程序后台配 request 合法域名**，
 *   开发阶段可在开发者工具勾「不校验合法域名」。
 * ⚠️ 新增示例图时三处同步：① 本清单 ② `src/static/sample/` 放文件
 *   ③ strip 脚本的豁免清单（若换目录）。
 *
 *⚠️ 为什么不用 base64 内联：36.7KB JPEG → base64 48.9KB（**膨胀 33%**，反而更大），
 *   且运行时不可缓存。项目已有base64 先例（`utils/sicons-base64.js` 272KB），
 *   那是为「必须精确着色的小图标」，示例图不属于该场景。
 */

/**
 * 统一路径前缀（后端托管目录）。
 * - H5 端uni base 是 `/card/`，故运行时用 `assetUrl()` 拼 origin
 * - 小程序端 `assetUrl()` → `resolveUrl()` → `API_DOMAIN +路径`
 */
const SAMPLE_BASE = '/card/static/sample/';

/**
 * 示例图清单。key 是**语义名**（不是文件名），便于两端引用时自解释。
 * 每项记录 `w`/`h` 真实像素尺寸—— 占位块用 `aspect-ratio: w / h` 撑高，
 * 与示例图自身比例、真图 `widthFix` 撑出的高度**三者一致** → 运营换真图时页面不跳动。
 */
export const SAMPLE_IMAGES = {
  /** 通用横幅：710×388（≈16:9），图片组件/轮播/图文等默认用它 */
  banner: { url: SAMPLE_BASE + 'image-sample-710x388.jpg', w: 710, h: 388 },
  /** 方形图：1:1，用于宫格头像、商品图、我的名片等方形位 */
  square: { url: SAMPLE_BASE + 'image-sample-square-400x400.jpg', w: 400, h: 400 },
  /** 竖版图：3:4，用于倒计时左右主图、视频封面竖版位 */
  portrait: { url: SAMPLE_BASE + 'image-sample-600x800.jpg', w: 600, h: 800 },
};

/** 取示例图的 URL（key 不存在时回落到 banner，避免渲染出空 src） */
export function sampleUrl(key) {
  const it = SAMPLE_IMAGES[key] || SAMPLE_IMAGES.banner;
  return it.url;
}

/** 取示例图的 { w, h }（用于占位块 aspect-ratio） */
export function sampleRatio(key) {
  const it = SAMPLE_IMAGES[key] || SAMPLE_IMAGES.banner;
  return it.w + ' / ' + it.h;
}
