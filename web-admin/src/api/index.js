import axios from 'axios';

export const adminApi = axios.create({ baseURL: '/api/admin' });
export const publicApi = axios.create({ baseURL: '/api' });
// 渠道API挂载在 /api/channel（非 /api/admin/channel），需要单独的带认证实例
export const channelApi = axios.create({ baseURL: '/api' });
// 支付API挂载在 /api/payment，使用带认证的通用实例
export const paymentApi = axios.create({ baseURL: '/api' });
channelApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('panorama_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
channelApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('panorama_token');
      window.location.href = '/admin.html#/login';
    }
    return Promise.reject(err.response?.data?.error || '请求失败');
  }
);

paymentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('panorama_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
paymentApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('panorama_token');
      window.location.href = '/admin.html#/login';
    }
    return Promise.reject(err.response?.data?.error || '请求失败');
  }
);

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('panorama_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('panorama_token');
      window.location.href = '/admin.html#/login';
    }
    return Promise.reject(err.response?.data?.error || '请求失败');
  }
);

publicApi.interceptors.request.use((config) => {
  // 兼容总后台(panorama_token)与客户后台(customer_token)两套登录态
  const token = localStorage.getItem('customer_token') || localStorage.getItem('panorama_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

publicApi.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err.response?.data?.error || '请求失败')
);

// 认证
export const login = (data) => publicApi.post('/auth/login', data);
export const loginByPhone = (data) => publicApi.post('/auth/login-phone', data);
export const sendSmsCode = (phone) => publicApi.post('/auth/sms-code', { phone });

// 工作台统计
export const fetchDashboardStats = () => adminApi.get('/dashboard/stats');

// 客户项目
export const fetchCustomers = () => adminApi.get('/projects');
export const createCustomer = (data) => adminApi.post('/projects', data);
export const updateCustomer = (id, data) => adminApi.put(`/projects/${id}`, data);
export const deleteCustomer = (id) => adminApi.delete(`/projects/${id}`);
export const impersonateCustomer = (id) => adminApi.post(`/projects/${id}/impersonate`);
export const uploadCustomerLogo = (file) => {
  const fd = new FormData();
  fd.append('logo', file);
  return adminApi.post('/projects/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// 方案
export const fetchPlans = () => adminApi.get('/plans');
export const createPlan = (data) => adminApi.post('/plans', data);
export const updatePlan = (id, data) => adminApi.put(`/plans/${id}`, data);
export const deletePlan = (id) => adminApi.delete(`/plans/${id}`);

// 场景
export const fetchScenes = () => adminApi.get('/scenes');
export const createScene = (data) => adminApi.post('/scenes', data);
export const updateScene = (id, data) => adminApi.put(`/scenes/${id}`, data);
export const deleteScene = (id) => adminApi.delete(`/scenes/${id}`);
export const uploadImage = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return adminApi.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// 用户
export const fetchUsers = () => adminApi.get('/users');
export const createUser = (data) => adminApi.post('/users', data);
export const updateUser = (id, data) => adminApi.put(`/users/${id}`, data);
export const deleteUser = (id) => adminApi.delete(`/users/${id}`);
export const resetUserPassword = (id) => adminApi.post(`/users/${id}/reset-password`);

// 解决方案
export const fetchSolutions = () => adminApi.get('/solutions');
export const createSolution = (data) => adminApi.post('/solutions', data);
export const updateSolution = (id, data) => adminApi.put(`/solutions/${id}`, data);
export const deleteSolution = (id) => adminApi.delete(`/solutions/${id}`);

// 设置
export const fetchSettings = () => adminApi.get('/settings');
export const saveSettings = (data) => adminApi.put('/settings', data);
export const fetchStorageConfig = () => adminApi.get('/storage');
export const saveStorageConfig = (data) => adminApi.put('/storage', data);
export const testStorage = (data) => adminApi.post('/storage/test', data);

// 日志
export const fetchLogs = (params) => adminApi.get('/logs', { params });

// 开放平台
export const fetchOAuthApps = () => adminApi.get('/oauth/apps');
export const createOAuthApp = (data) => adminApi.post('/oauth/apps', data);
export const updateOAuthApp = (id, data) => adminApi.put(`/oauth/apps/${id}`, data);
export const resetOAuthSecret = (id) => adminApi.post(`/oauth/apps/${id}/reset-secret`);
export const toggleOAuthApp = (id) => adminApi.post(`/oauth/apps/${id}/toggle`);
export const fetchOAuthStats = () => adminApi.get('/oauth/stats');
export const fetchApiLogs = (params) => adminApi.get('/oauth/api-logs', { params });

// 全端渠道
export const fetchChannelComponent = () => channelApi.get('/channel/component');
export const updateChannelComponent = (data) => channelApi.put('/channel/component', data);
export const refreshChannelToken = () => channelApi.post('/channel/component/refresh-token');
export const fetchChannelStats = () => channelApi.get('/channel/stats');
export const fetchChannelDefaults = () => channelApi.get('/channel/defaults');
export const updateChannelDefaults = (data) => channelApi.put('/channel/defaults', data);
export const fetchChannelTemplates = () => channelApi.get('/channel/templates');
export const fetchTenantChannels = (customerId) => channelApi.get(`/channel/tenants/${customerId}`);
export const updateTenantChannel = (customerId, channelType, data) => channelApi.put(`/channel/tenants/${customerId}/${channelType}`, data);
export const unbindTenantChannel = (customerId, channelType) => channelApi.delete(`/channel/tenants/${customerId}/${channelType}`);
export const getChannelAuthUrl = (params) => channelApi.get('/channel/auth-url', { params });
export const channelUploadCode = (id, data) => channelApi.post(`/channel/tenants/${id}/upload`, data);
export const channelSubmitAudit = (id) => channelApi.post(`/channel/tenants/${id}/submit-audit`);
export const channelAuditStatus = (id) => channelApi.get(`/channel/tenants/${id}/audit-status`);
export const channelRelease = (id) => channelApi.post(`/channel/tenants/${id}/release`);
export const channelRollback = (id) => channelApi.post(`/channel/tenants/${id}/rollback`);
export const fetchChannelDeployLogs = (id) => channelApi.get(`/channel/tenants/${id}/deploy-logs`);

// 客户后台API
const customerApi = axios.create({ baseURL: '/api/customer' });
customerApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('customer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
customerApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('customer_token');
      window.location.href = '/customer.html#/login';
    }
    return Promise.reject(err.response?.data?.error || '请求失败');
  }
);

export const customerApiCall = customerApi;

// 客户后台 - 支付（接口挂在 /api/payment，需带 customer_token 的独立实例）
const customerPaymentApi = axios.create({ baseURL: '/api' });
customerPaymentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('customer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
customerPaymentApi.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('customer_token');
      window.location.href = '/customer.html#/login';
    }
    return Promise.reject(err.response?.data?.error || '请求失败');
  }
);
export const customerPaymentCall = customerPaymentApi;

// 客户后台 - 全端渠道
export const fetchCustomerChannels = () => customerApi.get('/channels');
export const updateCustomerChannel = (type, data) => customerApi.put(`/channels/${type}`, data);
export const fetchCustomerMiniTemplates = () => customerApi.get('/channels/mini/templates');
export const getCustomerMiniAuthUrl = (data) => customerApi.post('/channels/mini/auth-url', data);
export const customerMiniUpload = (data) => customerApi.post('/channels/mini/upload', data);
export const customerMiniSubmitAudit = () => customerApi.post('/channels/mini/submit-audit');
export const customerMiniAuditStatus = () => customerApi.get('/channels/mini/audit-status');
export const customerMiniRelease = () => customerApi.post('/channels/mini/release');
export const customerMiniRollback = () => customerApi.post('/channels/mini/rollback');
export const fetchCustomerMiniDeployLogs = () => customerApi.get('/channels/mini/deploy-logs');

export default { adminApi, publicApi, customerApi };
