/**
 * 静态资源基址（小程序包体积优化用）
 *
 * 背景：小程序主包有 2MB 硬上限（开发者工具代码质量检查以 1.5MB 为「通过」线）。
 * 本项目 `src/static` 下有一部分资源**只服务 H5**（如 static/three，654KB，
 * 小程序端实际走 npm 的 threejs-miniprogram），构建后由 scripts/strip-mp-static.js
 * 从产物里剔除。
 *
 * ⚠️ 现状（2026-10-05 实测）：主包 1355KB，PNG 文件仅 12 个共 45.5KB
 *    （design-styles 页头素材 31KB + superform 证件底图 14KB）。
 *    **真正的大头是 utils/sicons-base64.js 的 174KB**（60 图标 × 21 色，
 *    其中 7 个「全量色」× 60 = 151KB 占 87%）。
 *    → 把 PNG 全上 CDN 只省 3.4%，性价比很低；图标才是优化重点。
 *
 * 真正需要远程化的是「运营可替换的素材」，这类应该走**后台下发**而非 CDN 基址：
 *   - 标题栏装饰图：已实现组件级替换（componentRegistry.js 的 assetSchema →
 *     DesignPage.vue 的 titleAsset()），素材经 POST /api/design/material 上传，
 *     存本地/OSS/七牛（getStorage 自动切换）。
 *   - 其他页面图片：后台「内容」里传 URL 即可（DesignPage 的 resolveUrl 已支持）。
 *
 * 本模块保留作为「整站静态资源迁 CDN」的开关：配置后 `/static/xxx` 会被改写到 CDN。
 *
 * 注意：
 *   - 必须是**已配置到小程序 downloadFile 合法域名**的资源，否则真机加载失败；
 *   - 首屏 LCP 元素（如装修页头）远程化会拖慢首屏，不建议迁；
 *   - 图标（SIcon）走 base64 data URI，不走本模块（见 scripts/gen-mp-sicons.js）。
 */

/** CDN 基址；为空字符串表示不启用远程化（保持包内资源） */
export const CDN_BASE = '';

/**
 * 把站内绝对路径的资源地址解析为可直接给 <image src> 用的地址。
 *
 * @param {string} u 资源路径，如 '/static/design-styles/title/bubble.png'
 * @returns {string} CDN 开启时为远程地址，否则原样返回
 */
export function assetUrl(u) {
  if (!u) return '';
  // 已是绝对地址 / data URI / blob，无需处理
  if (/^(https?:|data:|blob:|wxfile:)/i.test(u)) return u;
  if (!CDN_BASE) return u;
  return CDN_BASE.replace(/\/+$/, '') + (u.startsWith('/') ? u : '/' + u);
}
