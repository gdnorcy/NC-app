// 智能名片 API 封装
const BASE_URL = 'http://localhost:3000/api/card';
const MARKET_BASE_URL = 'http://localhost:3000/api/card-market';
const PAYMENT_BASE_URL = 'http://localhost:3000/api/payment';

function request(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('card_token');
    uni.request({
      url: url.startsWith('http') ? url : BASE_URL + url,
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
  getCardDynamics: (id) => request(`/cards/${id}/dynamics`),
  getCardVideos: (id) => request(`/cards/${id}/videos`),
  // 名片模板（平台公共 + 本租户私有）
  getTemplates: () => request('/templates'),
  // 动态互动（点赞/评论）
  likeDynamic: (id) => request(`/dynamics/${id}/like`, 'POST', {}),
  getComments: (id) => request(`/dynamics/${id}/comments`),
  addComment: (id, content) => request(`/dynamics/${id}/comments`, 'POST', { content }),

  // 访客采集
  trackVisitor: (data) => request('/visitor/track', 'POST', data),

  // 访客雷达
  getVisitorSummary: () => request('/visitors/summary'),
  getVisitorTimeline: (openid) => request(`/visitors/${openid}/timeline`),

  // ===== 分销中心（租户维度，双身份隔离）=====
  distBind: (parentId, identityType) => request('/distribution/bind', 'POST', { parentId, identityType }),
  distQrcode: () => request('/distribution/qrcode', 'GET'),
  distSummary: (identityType) => request(`/distribution/summary?identityType=${identityType || ''}`),
  distApply: () => request('/distribution/apply', 'POST'),
  distSubs: (level, page) => request(`/distribution/subs?level=${level}&page=${page || 1}&pageSize=20`),
  distLogs: (params = {}) => request(`/distribution/logs?page=${params.page || 1}&pageSize=${params.pageSize || 20}&type=${params.type || ''}&identityType=${params.identityType || ''}`),
  distWallet: (identityType) => request(`/distribution/wallet?identityType=${identityType || ''}`),
  distWithdraw: (amount, identityType, payAccount) => request('/distribution/withdraw', 'POST', { amount, identityType, payAccount }),
  distWithdraws: (params = {}) => request(`/distribution/withdraws?page=${params.page || 1}&pageSize=${params.pageSize || 20}&status=${params.status || ''}&identityType=${params.identityType || ''}`),
  distTeam: (identityType, scope) => request(`/distribution/team?identityType=${identityType || ''}${scope ? `&scope=${scope}` : ''}`),
  distTeamOrders: (page, identityType) => request(`/distribution/team-orders?page=${page || 1}&pageSize=20&identityType=${identityType || ''}`),
  markVisitorRead: (openid) => request(`/visitors/${openid}/read`, 'POST'),

  // 客户管理
  getCustomers: (params) => request('/customers' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  createCustomer: (data) => request('/customers', 'POST', data),
  updateCustomer: (id, data) => request(`/customers/${id}`, 'PUT', data),
  addFollow: (id, data) => request(`/customers/${id}/follow`, 'POST', data),
  getFollows: (id) => request(`/customers/${id}/follows`),

  // 人脉集市（租户级）
  getMarketList: (params) => request(MARKET_BASE_URL + '/market/list' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  submitForm: (id, data) => request(MARKET_BASE_URL + `/forms/${id}/submit`, 'POST', { data }),
  getMarketSettings: () => request(MARKET_BASE_URL + '/market/settings'),
  toggleMarket: (data) => request(MARKET_BASE_URL + '/market/toggle', 'POST', data),
  checkMarket: (params) => request(MARKET_BASE_URL + '/market/check' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  getMarketMyStatus: () => request(MARKET_BASE_URL + '/market/my-status'),
  getMarketMyStats: () => request(MARKET_BASE_URL + '/market/my-stats'),

  // 名片交换
  exchangeRequest: (data) => request(MARKET_BASE_URL + '/exchange/request', 'POST', data),
  exchangeHandle: (data) => request(MARKET_BASE_URL + '/exchange/handle', 'POST', data),
  getExchangeList: () => request(MARKET_BASE_URL + '/exchange/list'),
  getConnections: () => request(MARKET_BASE_URL + '/connections'),
  updateConnection: (id, data) => request(MARKET_BASE_URL + `/connections/${id}`, 'PUT', data),
  deleteConnection: (id) => request(MARKET_BASE_URL + `/connections/${id}`, 'DELETE'),
  convertConnectionToCustomer: (id) => request(MARKET_BASE_URL + `/connections/${id}/convert-customer`, 'POST'),
  getExchangeUnread: () => request(MARKET_BASE_URL + '/exchange/unread'),

  // 消息通知
  getMessages: (type) => request(MARKET_BASE_URL + '/messages' + (type ? `?type=${type}` : '')),
  getMessageUnread: () => request(MARKET_BASE_URL + '/messages/unread'),
  markMessagesRead: (ids) => request(MARKET_BASE_URL + '/messages/read', 'POST', { ids }),

  // 入驻管理
  getIndividuals: () => request(MARKET_BASE_URL + '/individuals'),
  getEnterprises: () => request(MARKET_BASE_URL + '/enterprises'),
  getEnterpriseEmployees: (id) => request(`/card-market/enterprises/${id}/employees`),
  submitApply: (data) => request(MARKET_BASE_URL + '/apply', 'POST', data),
  // 本人入驻申请状态（独立 URL：/api/card-market 域，未绑定租户也可查询）
  getApplyStatus: () => new Promise((resolve, reject) => {
    const token = uni.getStorageSync('card_token');
    uni.request({
      url: 'http://localhost:3000/api/card-market/apply/status',
      method: 'GET',
      header: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
      success: (res) => (res.statusCode === 200 ? resolve(res.data) : reject(new Error(res.data?.error || '请求失败'))),
      fail: (err) => reject(err),
    });
  }),
  getMyEnterprise: () => request(MARKET_BASE_URL + '/enterprise/my-data'),

  // 公海池
  getPublicPool: () => request(MARKET_BASE_URL + '/public-pool'),
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

// 接口域名（不含 /api 路径段）：用于相对路径资源（如全景图 /uploads/xxx）拼接完整 URL
export const API_DOMAIN = BASE_URL.replace(/\/api\/[^/]*$/, '');
