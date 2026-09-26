// 冷启动首页联动：装修中心「首页」（is_home=1）配置谁就跳谁（商城/全景/名片/自定义页）
// 纯决策函数：给定接口返回的 homePageUrl 与当前页，返回需要 reLaunch 的目标 URL（含 tid）；
// 无配置或当前页即目标时返回 ''（不跳转），避免死循环。

export function buildGlobalHomeRedirect(homePageUrl, tid, curRoute) {
  if (!homePageUrl) return '';
  const target = homePageUrl + (tid ? (homePageUrl.includes('?') ? '&tid=' : '?tid=') + tid : '');
  const curPath = '/' + String(curRoute || '').replace(/^\//, '');
  if (curPath === homePageUrl.split('?')[0]) return '';
  return target;
}
