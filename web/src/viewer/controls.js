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
 * 统一坐标模型（与小程序/编辑器一致）：yaw 0°=初始视线 -X，绕Y轴右旋（yaw 增大=视野右转）；pitch 向上为正。
 */
export function directionFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: -cp * Math.cos(yaw),
    y: Math.sin(pitch),
    z: -cp * Math.sin(yaw),
  };
}

/**
 * 根据拖拽增量更新 yaw/pitch（与 -X 模型一致）。
 * dx>0（向右拖）→ yaw 增大（视野向右转）；
 * dy>0（向下拖）→ pitch 减小（视野向下转）。
 */
export function applyDrag(yaw, pitch, dx, dy, sensitivity = 0.005) {
  return {
    yaw: yaw + dx * sensitivity,
    pitch: clampPitch(pitch - dy * sensitivity),
  };
}
