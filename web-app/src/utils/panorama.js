/**
 * 全景热点投影纯函数（H5/小程序双端共用）
 * 相机模型：半径为100球面上的观察点，视线指向球心；lon/lat 为视角（度）。
 * 热点方向定义：yaw 0°=初始视线（-X），绕Y轴右旋；pitch 向上（度）。
 */

export function deg2rad(deg) {
  return deg * Math.PI / 180;
}

/** 热点世界方向向量（单位向量），yaw 正方向为右转 */
export function hotspotDir(h) {
  const yaw = ((Number(h.yaw) || 0) % 360) * Math.PI / 180;
  const pitch = Math.max(-89, Math.min(89, Number(h.pitch) || 0)) * Math.PI / 180;
  const cp = Math.cos(pitch);
  return [
    -cp * Math.cos(yaw),
    Math.sin(pitch),
    -cp * Math.sin(yaw),
  ];
}

/**
 * 将热点投影到屏幕坐标
 * @param {Array} hotspots 热点数组（含 yaw/pitch）
 * @param {number} lon 当前水平视角（度）
 * @param {number} lat 当前垂直视角（度）
 * @param {number} w 画布宽
 * @param {number} h 画布高
 * @param {number} fov 相机垂直视场角（度，默认 75，与 PerspectiveCamera 一致）
 * @returns {Object} idx -> { visible, x, y }
 */
export function projectHotspots(hotspots, lon, lat, w, h, fov = 75) {
  const result = {};
  const latClamped = Math.max(-85, Math.min(85, Number(lat) || 0));
  const phi = deg2rad(90 - latClamped);
  const theta = deg2rad(Number(lon) || 0);
  // 相机位置（半径100球面）
  const cam = [
    100 * Math.sin(phi) * Math.cos(theta),
    100 * Math.cos(phi),
    100 * Math.sin(phi) * Math.sin(theta),
  ];
  // 视线方向（相机→球心）
  const forward = [-cam[0] / 100, -cam[1] / 100, -cam[2] / 100];
  // right = normalize(cross(forward, up))，up=(0,1,0)
  // cross(a,b) = (a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x)
  const rightRaw = [
    forward[1] * 0 - forward[2] * 1,
    forward[2] * 0 - forward[0] * 0,
    forward[0] * 1 - forward[1] * 0,
  ];
  const rl = Math.sqrt(rightRaw[0] * rightRaw[0] + rightRaw[1] * rightRaw[1] + rightRaw[2] * rightRaw[2]) || 1;
  const right = [rightRaw[0] / rl, rightRaw[1] / rl, rightRaw[2] / rl];
  // upv = cross(right, forward)
  const upv = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const focal = (h / 2) / Math.tan(deg2rad(fov) / 2);

  (hotspots || []).forEach((hp, idx) => {
    const d = hotspotDir(hp);
    const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
    if (depth <= 0.15) {
      result[idx] = { visible: false, x: 0, y: 0 };
      return;
    }
    const rel = d[0] * right[0] + d[1] * right[1] + d[2] * right[2];
    const up = d[0] * upv[0] + d[1] * upv[1] + d[2] * upv[2];
    result[idx] = {
      visible: true,
      x: Math.round(w / 2 + (rel * focal / depth)),
      y: Math.round(h / 2 - (up * focal / depth)),
    };
  });
  return result;
}
