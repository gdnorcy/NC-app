// 总后台：应用 → 配置入口映射（新增应用有总后台配置项时在此登记）
export const ADMIN_APP_CONFIGS = {
  card: {
    name: '智能名片',
    entries: [
      { title: '名片模板', desc: '平台公共模板库，启停与主题配置', path: '/templates', icon: 'template' },
      { title: '雷达管理', desc: '访客雷达、足迹与运营数据', path: '/radar', icon: 'chart' },
      { title: '会员套餐', desc: '名片会员套餐与权益定价', path: '/member-packages', icon: 'badge' },
      { title: '收藏管理', desc: '名片收藏记录与数据分析', path: '/card-collects', icon: 'like' },
    ],
  },
};

// 是否有总后台配置入口（应用中心据此显示"进入管理"）
export function hasAdminManage(code) {
  const cfg = ADMIN_APP_CONFIGS[code];
  return !!cfg && cfg.entries.length > 0;
}
