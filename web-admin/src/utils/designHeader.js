// 头部方案二（ew）合并工具：全局默认 + 单页覆盖。
// 逻辑与 C 端 web-app/src/utils/design.js normalizeHeader(scheme===2) 保持一致：
// 页面 ew 字段覆盖全局默认；layers 逐层逐段兜底合并。

/** 单层左/中/右三段合并（页面覆盖全局） */
export function mergeEwLayer(g, p) {
  const gL = g?.left || {}; const pL = p?.left || {};
  const gM = g?.middle || {}; const pM = p?.middle || {};
  const gR = g?.right || {}; const pR = p?.right || {};
  return {
    left: {
      type: pL.type ?? gL.type ?? 'none', image: pL.image ?? gL.image ?? '', icon: pL.icon ?? gL.icon ?? '',
      color: pL.color ?? gL.color ?? '#ffffff', link: pL.link ?? gL.link ?? '',
      store: { info: '', province: '', city: '', district: '', address: '', name: '', color: '#ffffff', ...(gL.store || {}), ...(pL.store || {}) },
    },
    middle: {
      type: pM.type ?? gM.type ?? 'none', image: pM.image ?? gM.image ?? '', link: pM.link ?? gM.link ?? '',
      search: { fillBg: '#f2f2f2', borderBg: '#ffffff', iconColor: '#3d404d', textColor: '#ffffff', placeholder: '', placeholderLen: 0, placeholderMax: 10, hotword: false, showBtn: true, ...(gM.search || {}), ...(pM.search || {}) },
    },
    right: {
      type: pR.type ?? gR.type ?? 'none', image: pR.image ?? gR.image ?? '', icon: pR.icon ?? gR.icon ?? '',
      color: pR.color ?? gR.color ?? '#ffffff', link: pR.link ?? gR.link ?? '',
    },
  };
}

/** 合并全局默认 ew 与页面 ew（页面覆盖全局），返回完整 ew 结构 */
export function mergeEwHeader(globalEw, pageEw) {
  const gEw = globalEw || {};
  const pEw = pageEw || {};
  const gl = Array.isArray(gEw.layers) ? gEw.layers : [];
  const pl = Array.isArray(pEw.layers) ? pEw.layers : [];
  const layers = [0, 1].map((i) => mergeEwLayer(gl[i] || {}, pl[i] || {}));
  return {
    funcModule: pEw.funcModule ?? gEw.funcModule ?? 'none',
    textColor: pEw.textColor ?? gEw.textColor ?? 'black',
    headBg: { mode: 'color', color: '#ffffff', image: '', ...(gEw.headBg || {}), ...(pEw.headBg || {}) },
    scrollBg: { mode: 'color', color: 'transparent', image: '', ...(gEw.scrollBg || {}), ...(pEw.scrollBg || {}) },
    layers,
    copyright: pEw.copyright ?? gEw.copyright ?? 'default',
  };
}
