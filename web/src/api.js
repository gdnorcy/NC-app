/** API 客户端：展示端与管理后台共用
 *  三层模型：客户项目(projects) → 方案(plans) → 场景(scenes)
 */

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

// ———————— 展示端（公开） ————————

/** 展示端：获取上架场景列表 */
export async function fetchScenes() {
  const data = await request('/api/scenes');
  return data.scenes;
}

/** 展示端：公开方案列表（兼容旧函数名，内部调 /api/plans） */
export async function fetchProjects() {
  const data = await request('/api/plans');
  return data.plans;
}

/** 展示端：方案详情（兼容旧函数名，返回 {project, scenes}） */
export async function fetchProject(id) {
  const data = await request(`/api/plans/${id}`);
  return { project: data.plan, scenes: data.scenes };
}

/** 展示端：分享令牌解析（方案级或场景级） */
export async function fetchShare(token) {
  return request(`/api/s/${encodeURIComponent(token)}`);
}

// ———————— 认证 ————————

export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

/** 发送短信验证码（purpose: register | login） */
export function sendSmsCode(phone, purpose = 'register') {
  return request('/api/auth/sms-code', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose }),
  });
}

/** 手机号 + 验证码注册 */
export function registerByPhone({ phone, code, password, username }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone, code, password, username }),
  });
}

/** 手机号 + 验证码登录 */
export function loginByPhone(phone, code) {
  return request('/api/auth/login-phone', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

/** 当前登录用户信息（从 token 解码，前端不存敏感信息） */
export function getCurrentUser() {
  const token = localStorage.getItem('panorama_token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { id: payload.uid, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

function adminHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('panorama_token') || ''}` };
}

// ———————— 后台：客户项目 ————————

export function fetchAdminCustomers() {
  return request('/api/admin/projects', { headers: adminHeaders() });
}

export function fetchAdminCustomer(id) {
  return request(`/api/admin/projects/${id}`, { headers: adminHeaders() });
}

export function createCustomer(payload) {
  return request('/api/admin/projects', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateCustomer(id, payload) {
  return request(`/api/admin/projects/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteCustomer(id) {
  return request(`/api/admin/projects/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

export function impersonateCustomer(id) {
  return request(`/api/admin/projects/${id}/impersonate`, {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export async function uploadCustomerLogo(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/projects/logo', {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Logo 上传失败');
  return data;
}

// ———————— 后台：方案 ————————

export function fetchAdminPlans() {
  return request('/api/admin/plans', { headers: adminHeaders() });
}

export function createPlan(payload) {
  return request('/api/admin/plans', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updatePlan(id, payload) {
  return request(`/api/admin/plans/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deletePlan(id) {
  return request(`/api/admin/plans/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

export async function uploadPlanCover(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/plans/cover', {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '封面上传失败');
  return data;
}

// 兼容旧后台函数名
export const fetchAdminProjects = fetchAdminPlans;
export const createProject = createPlan;
export const updateProject = updatePlan;
export const deleteProject = deletePlan;
export const uploadCover = uploadPlanCover;

// ———————— 后台：场景 ————————

export function fetchAdminScenes() {
  return request('/api/admin/scenes', { headers: adminHeaders() });
}

export function createScene(payload) {
  return request('/api/admin/scenes', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateScene(id, payload) {
  return request(`/api/admin/scenes/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteScene(id) {
  return request(`/api/admin/scenes/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

/** 后台：上传全景图，服务端自动转码 */
export async function uploadImage(file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}

// ———————— 后台：存储设置 ————————

export function fetchStorageConfig() {
  return request('/api/admin/storage', { headers: adminHeaders() });
}

export function saveStorageConfig(payload) {
  return request('/api/admin/storage', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function testStorage(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/admin/storage/test', {
      method: 'POST',
      headers: payload ? { ...adminHeaders(), 'Content-Type': 'application/json' } : adminHeaders(),
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '测试失败');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('连接超时，请检查网络或配置');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ———————— 后台：用户管理（仅 admin） ————————

export function fetchAdminUsers() {
  return request('/api/admin/users', { headers: adminHeaders() });
}

export function createAdminUser(payload) {
  return request('/api/admin/users', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function updateAdminUser(id, payload) {
  return request(`/api/admin/users/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function deleteAdminUser(id) {
  return request(`/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

export function impersonateUser(id) {
  return request(`/api/admin/users/${id}/impersonate`, {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export function resetUserPassword(id, password) {
  return request(`/api/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ password }),
  });
}

// ———————— 系统设置 ————————

export function fetchAdminSettings() {
  return request('/api/admin/settings', { headers: adminHeaders() });
}

export function saveAdminSettings(pairs) {
  return request('/api/admin/settings', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(pairs),
  });
}

export function fetchPublicSettings() {
  return request('/api/settings/public');
}

// ———————— 操作日志 ————————

export function fetchOperationLogs({ userId, action, targetType, from, to, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (action) params.set('action', action);
  if (targetType) params.set('targetType', targetType);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', limit);
  params.set('offset', offset);
  return request(`/api/admin/logs?${params.toString()}`, { headers: adminHeaders() });
}
