// 分销模块纯函数：金额格式化 / 状态映射（前后台共用，需保持与页面一致）
export function fen(v) {
  return ((Number(v) || 0) / 100).toFixed(2);
}

export function sourceLabel(s) {
  return { card: '名片', market: '集市', qrcode: '推广码' }[s] || s || '-';
}

export function logTypeLabel(t) {
  return { level1: '一级佣金', level2: '二级佣金', partner: '合伙人分红', share_all: '全民股东', share_cat: '类目股东', share_area: '区域股东' }[t] || t;
}

export function logTypeTag(t) {
  return t === 'level2' ? 'info' : 'primary';
}

export function statusLabel(s) {
  return { pending: '待结算', settled: '已结算', charged_back: '已扣回' }[s] || s;
}

export function withdrawLabel(s) {
  return { pending: '待审核', approved: '待打款', rejected: '已驳回', done: '已完成' }[s] || s;
}

export function withdrawTag(s) {
  return { pending: 'warning', approved: 'primary', rejected: 'danger', done: 'success' }[s] || 'info';
}
