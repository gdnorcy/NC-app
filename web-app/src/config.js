/**
 * C 端部署配置
 *
 * DEFAULT_TENANT_ID：单租户/独立域名部署时填写默认租户 ID。
 * 游客（未登录）打开智能名片首页等公开页面时，design/config 无显式租户（URL 无 tid、未登录）
 * 会自动带上该默认租户，保证装修首页对游客可见；已登录用户仍以登录态租户为准（后端 customerId 优先）。
 * 多租户共享同一 H5 域名部署时保持 0，靠分享链接/URL 透传 tid 识别租户。
 */
export const DEFAULT_TENANT_ID = 1;
