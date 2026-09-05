/**
 * 渐进加载计划：低清预览图优先渲染出画面，主图随后静默替换。
 * 无预览图（历史数据）时退化为单步主图加载。
 * @returns {Array<{url: string, kind: 'preview'|'main'}>}
 */
export function planProgressiveLoad(previewPath, imagePath) {
  const steps = [];
  if (previewPath) steps.push({ url: previewPath, kind: 'preview' });
  if (imagePath) steps.push({ url: imagePath, kind: 'main' });
  return steps;
}
