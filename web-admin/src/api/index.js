import axios from 'axios';

const adminApi = axios.create({ baseURL: '/api/admin' });
const publicApi = axios.create({ baseURL: '/api' });

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

publicApi.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err.response?.data?.error || '请求失败')
);

// 认证
export const login = (data) => publicApi.post('/auth/login', data);
export const loginByPhone = (data) => publicApi.post('/auth/login-phone', data);
export const sendSmsCode = (phone) => publicApi.post('/auth/sms-code', { phone });

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
export default { adminApi, publicApi, customerApi };
