/** API 客户端：展示端与管理后台共用 */

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

/** 展示端：获取上架场景列表（返回场景数组） */
export async function fetchScenes() {
  const data = await request('/api/scenes');
  return data.scenes;
}

/** 后台：登录 */
export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

function adminHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('panorama_token') || ''}` };
}

/** 后台：全部场景 */
export function fetchAdminScenes() {
  return request('/api/admin/scenes', { headers: adminHeaders() });
}

/** 后台：新建场景 */
export function createScene(payload) {
  return request('/api/admin/scenes', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

/** 后台：更新场景 */
export function updateScene(id, payload) {
  return request(`/api/admin/scenes/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

/** 后台：删除场景 */
export function deleteScene(id) {
  return request(`/api/admin/scenes/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

/** 后台：上传全景图，服务端自动转码，返回 { path, previewPath } */
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

/** 后台：读取存储配置 */
export function fetchStorageConfig() {
  return request('/api/admin/storage', { headers: adminHeaders() });
}

/** 后台：保存存储配置 */
export function saveStorageConfig(payload) {
  return request('/api/admin/storage', {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

/** 后台：测试存储连接（可传表单配置；不传则测试已保存配置）。15 秒超时防止网络挂起 */
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
