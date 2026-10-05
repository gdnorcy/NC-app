/**
 * 静态资源基址（小程序包体积优化用）
 *
 * 背景：小程序主包有 2MB 硬上限（开发者工具代码质量检查以 1.5MB 为「通过」线）。
 * 本项目 `src/static` 下有一部分资源**只服务 H5**（如 static/three，654KB，
 * 小程序端实际走 npm 的 threejs-miniprogram），构建后由 scripts/strip-mp-static.js
 * 从产物里剔除。
 *
 * 剔除属于「事后补救」，更彻底的做法是把这类资源放到 CDN / 远程附件，
 * 由本模块统一改写 `/static/xxx` → `${CDN_BASE}/static/xxx`。
 *
 * 用法：
 *   在 src/config.js 里配置 CDN_BASE（留空 = 走包内资源，行为与现在一致），
 *   模板/代码里把写死的 '/static/xxx' 改成 assetUrl('/static/xxx')。
 *
 * 注意：
 *   - 必须是**同域或已配置到小程序 downloadFile 合法域名**的资源，否则真机加载失败；
 *   - 图标类资源（SIcon）走 base64 data URI，不走本模块（见 scripts/gen-mp-sicons.js）。
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
