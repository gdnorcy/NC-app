// 跨端安全的 URL query 序列化/解析
// 小程序运行环境（JSCore/游客模式）不支持 URLSearchParams，所有 query 拼装必须走这里
export function qsStringify(obj) {
  if (!obj) return '';
  return Object.keys(obj)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k] == null ? '' : obj[k])}`)
    .join('&');
}

export function qsParse(str) {
  const out = {};
  const q = String(str || '').replace(/^\?/, '');
  if (!q) return out;
  for (const seg of q.split('&')) {
    if (!seg) continue;
    const i = seg.indexOf('=');
    const k = i >= 0 ? decodeURIComponent(seg.slice(0, i)) : decodeURIComponent(seg);
    const v = i >= 0 ? decodeURIComponent(seg.slice(i + 1)) : '';
    out[k] = v;
  }
  return out;
}
