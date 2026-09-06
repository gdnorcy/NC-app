// 智能名片 API 封装
const BASE_URL = 'http://localhost:3000/api/card';

function request(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('card_token');
    uni.request({
      url: BASE_URL + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      success: (res) => {
        if (res.statusCode === 401) {
          uni.removeStorageSync('card_token');
          uni.removeStorageSync('card_user');
          uni.reLaunch({ url: '/pages/card/login' });
          reject(new Error('未登录'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.error || '请求失败'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

export const cardApi = {
  // 微信登录
  wxLogin: (code, parentId) => request('/auth/wx-login', 'POST', { code, parentId }),

  // 用户信息
  getProfile: () => request('/user/profile'),
  updateProfile: (data) => request('/user/profile', 'PUT', data),

  // 名片
  getCards: () => request('/cards'),
  getCard: (id) => request(`/cards/${id}`),
  createCard: (data) => request('/cards', 'POST', data),
  updateCard: (id, data) => request(`/cards/${id}`, 'PUT', data),
  deleteCard: (id) => request(`/cards/${id}`, 'DELETE'),

  // 访客采集
  trackVisitor: (data) => request('/visitor/track', 'POST', data),

  // 访客雷达
  getVisitorSummary: () => request('/visitors/summary'),
  getVisitorTimeline: (openid) => request(`/visitors/${openid}/timeline`),

  // 客户管理
  getCustomers: (params) => request('/customers' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  createCustomer: (data) => request('/customers', 'POST', data),
  updateCustomer: (id, data) => request(`/customers/${id}`, 'PUT', data),
  addFollow: (id, data) => request(`/customers/${id}/follow`, 'POST', data),
  getFollows: (id) => request(`/customers/${id}/follows`),

  // 名片交换
  exchangeCard: (data) => request('/exchange', 'POST', data),

  // 人脉集市
  getMarket: (params) => request('/market' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  // 会员
  getPackages: () => request('/member/packages'),
  getMemberStatus: () => request('/member/status'),

  // 分销
  getDistributionSummary: () => request('/distribution/summary'),
  getCommissions: () => request('/distribution/commissions'),
  getTeam: () => request('/distribution/team'),

  // 动态
  getDynamics: () => request('/dynamics'),
  createDynamic: (data) => request('/dynamics', 'POST', data),
};
