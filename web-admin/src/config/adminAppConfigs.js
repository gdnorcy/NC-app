// 总后台：应用 → 配置入口映射（新增应用有总后台配置项时在此登记）
// 🔴 约定：以后新增「平台级设置」一律登记到对应应用的 entries 下（应用中心 → 该应用 → 专用入口），
//    不要在侧边栏另开独立分组 —— 平台能力跟着应用归类走。
export const ADMIN_APP_CONFIGS = {
  card: {
    name: '智能名片',
    entries: [
      { title: '名片模板', desc: '平台公共模板库，启停与主题配置', path: '/templates', icon: 'template' },
      { title: '雷达管理', desc: '访客雷达、足迹与运营数据', path: '/radar', icon: 'chart' },
      { title: '套餐模板库', desc: '新租户标准会员档模板（名称/价格/场席）', path: '/member-packages', icon: 'badge' },
      { title: '收藏管理', desc: '名片收藏记录与数据分析', path: '/card-collects', icon: 'like' },
    ],
  },
  trace: {
    name: '防伪溯源',
    entries: [
      { title: '平台设置', desc: '自定义域名 / API 授权 / 生成权限 / 手机端模板 / 码库存 / 服务商支付', path: '/trace-platform', icon: 'verify' },
    ],
  },
};

// 是否有总后台配置入口（应用中心据此显示"进入管理"）
export function hasAdminManage(code) {
  const cfg = ADMIN_APP_CONFIGS[code];
  return !!cfg && cfg.entries.length > 0;
}
