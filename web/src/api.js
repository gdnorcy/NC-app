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

/** 后台：上传全景图，返回服务器路径 */
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
  return data.path;
}
