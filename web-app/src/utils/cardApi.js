// 智能名片 API 封装
const BASE_URL = 'http://localhost:3000/api/card';
const PAYMENT_BASE_URL = 'http://localhost:3000/api/payment';

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

// 支付API请求（使用card_token认证）
function paymentRequest(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('card_token');
    uni.request({
      url: PAYMENT_BASE_URL + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      success: (res) => {
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
  createCardWithApply: (data) => request('/cards/create-with-apply', 'POST', data),
  updateCard: (id, data) => request(`/cards/${id}`, 'PUT', data),
  deleteCard: (id) => request(`/cards/${id}`, 'DELETE'),
  getCardWorks: (id) => request(`/cards/${id}/works`),

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

  // 人脉集市（租户级）
  getMarketList: (params) => request('/card-market/market/list' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  getMarketSettings: () => request('/card-market/market/settings'),
  toggleMarket: (data) => request('/card-market/market/toggle', 'POST', data),
  checkMarket: (params) => request('/card-market/market/check' + (params ? '?' + new URLSearchParams(params).toString() : '')),

  // 名片交换
  exchangeRequest: (data) => request('/card-market/exchange/request', 'POST', data),
  exchangeHandle: (data) => request('/card-market/exchange/handle', 'POST', data),
  getExchangeList: () => request('/card-market/exchange/list'),
  getConnections: () => request('/card-market/connections'),
  convertConnectionToCustomer: (id) => request(`/card-market/connections/${id}/convert-customer`, 'POST'),

  // 入驻管理
  getIndividuals: () => request('/card-market/individuals'),
  getEnterprises: () => request('/card-market/enterprises'),
  getEnterpriseEmployees: (id) => request(`/card-market/enterprises/${id}/employees`),
  submitApply: (data) => request('/card-market/apply', 'POST', data),
  getMyEnterprise: () => request('/card-market/enterprise/my-data'),

  // 公海池
  getPublicPool: () => request('/card-market/public-pool'),
  claimPoolCustomer: (id) => request(`/card-market/public-pool/${id}/claim`, 'POST'),

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

// 支付API
export const paymentApi = {
  // 创建支付订单
  createOrder: (data) => paymentRequest('/create', 'POST', data),
  // 模拟支付成功（开发环境）
  mockPay: (orderNo) => paymentRequest('/mock-pay', 'POST', { orderNo }),
  // 查询订单
  getOrder: (orderNo) => paymentRequest(`/orders/${orderNo}`),
  // 我的订单
  getMyOrders: (params) => paymentRequest('/my-orders' + (params ? '?' + new URLSearchParams(params).toString() : '')),
};
