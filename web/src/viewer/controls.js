/** 纯数学工具：视角控制相关的无副作用函数，便于单元测试 */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const DEG = Math.PI / 180;

/** 俯仰角钳制（弧度），默认 ±89°，避免穿过极点导致翻转 */
export function clampPitch(pitch, limit = 89 * DEG) {
  return clamp(pitch, -limit, limit);
}

/** 视场角钳制（度） */
export function clampFov(fov, min = 30, max = 110) {
  return clamp(fov, min, max);
}

/**
 * 由 yaw（水平角）/ pitch（俯仰角）计算相机朝向单位向量。
 * yaw=0,pitch=0 时看向 -Z。
 */
export function directionFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: -cp * Math.sin(yaw),
    y: Math.sin(pitch),
    z: -cp * Math.cos(yaw),
  };
}

/**
 * 根据拖拽增量更新 yaw/pitch。
 * dx>0（向右拖）→ yaw 减小（视野向右转）；
 * dy>0（向下拖）→ pitch 增大（视野向上转）。
 */
export function applyDrag(yaw, pitch, dx, dy, sensitivity = 0.005) {
  return {
    yaw: yaw - dx * sensitivity,
    pitch: clampPitch(pitch + dy * sensitivity),
  };
}
