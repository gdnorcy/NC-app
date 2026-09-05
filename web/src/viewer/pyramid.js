/**
 * 金字塔瓦片：纯函数工具（便于单元测试）。
 * 球面坐标与 three.js SphereGeometry 保持一致：
 *   P(phi, theta) = (-cos(phi)*sin(theta), cos(theta), sin(phi)*sin(theta))
 * 即纹理 u 与 phi 线性对应、图片顶部对应 theta=0（北极）。
 */

/** 按视口宽度与 DPR 选择目标层：从高到低取第一个宽度 <= ideal 的层 */
export function pickTargetLevel(levels, viewportWidth, dpr = 1) {
  if (!levels || !levels.length) return null;
  const ideal = Math.min(8192, Math.max(2048, Math.round(viewportWidth * 3 * Math.min(dpr, 2))));
  for (const level of levels) {
    if (level.width <= ideal) return level;
  }
  return levels[levels.length - 1];
}

/** 由模板拼瓦片 URL */
export function tileUrl(template, level, col, row) {
  return template.replace('{width}', level.width).replace('{col}', col).replace('{row}', row);
}

/** 计算相机可见的瓦片集合：球面点积 + 瓦片半角余量（保守包含边缘） */
export function visibleTiles(level, dir, halfFovX, halfFovY, pad = 0.5) {
  const tiles = [];
  if (!level || !dir) return tiles;
  const tileAng = Math.max((2 * Math.PI) / level.cols, Math.PI / level.rows) * pad;
  const cutoff = Math.max(halfFovX, halfFovY) + tileAng;
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const phi = ((col + 0.5) / level.cols) * 2 * Math.PI;
      const theta = ((row + 0.5) / level.rows) * Math.PI;
      const px = -Math.cos(phi) * Math.sin(theta);
      const py = Math.cos(theta);
      const pz = Math.sin(phi) * Math.sin(theta);
      const dot = Math.max(-1, Math.min(1, px * dir.x + py * dir.y + pz * dir.z));
      if (Math.acos(dot) < cutoff) tiles.push([col, row]);
    }
  }
  return tiles;
}

/**
 * 可见集膨胀：向四周扩展一圈瓦片用于预取（经度环绕，纬度钳制），
 * 拖动视角时边缘不会露出低清 base。返回 [{col,row,priority}]，可见=1 预取=0。
 */
export function expandTiles(visible, level) {
  if (!level || !Array.isArray(visible)) return [];
  const map = new Map();
  for (const [c, r] of visible) {
    map.set(`${c}_${r}`, { col: c, row: r, priority: 1 });
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nc = (c + dc + level.cols) % level.cols;
      const nr = Math.max(0, Math.min(level.rows - 1, r + dr));
      const k = `${nc}_${nr}`;
      if (!map.has(k)) map.set(k, { col: nc, row: nr, priority: 0 });
    }
  }
  return [...map.values()];
}
