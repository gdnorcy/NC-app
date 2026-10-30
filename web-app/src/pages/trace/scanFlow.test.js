import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 防伪溯源页（web-app）：扫码自动出结果（#521）+ 独立活动广告位（#522）。
//
// #521 的坑（真实事故）：applyScanCode 是**异步**回填 form.co（要调 scanEntry 接口拿清洗后的码），
//   之前 runScanFlow 没 await 它就直接 submit() → submit 读到空 form.co → 「扫码后还要再点一次立即查询」。
//   这条把「先 await 回填、再提交」的顺序钉死，防止以后有人"顺手"去掉 await。
//
// #522 的坑：活动广告位是**独立区块**（不复用首页展示位 displaySlots），两者不能互相污染。

const src = readFileSync(fileURLToPath(new URL('./index.vue', import.meta.url)), 'utf8');

/** 取某个函数体的源码（按大括号配平截取）。兼容 `function x(` 与 `const x = computed(` 两种写法。 */
function fnBody(name) {
  let start = src.indexOf(`function ${name}(`);
  if (start === -1) start = src.indexOf(`const ${name} = computed(`);
  expect(start, `找不到函数 ${name}`).toBeGreaterThan(-1);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

describe('#521 扫码后自动出结果（去掉多余的「立即查询」）', () => {
  test('runScanFlow 必须先 await 回填防伪码，再 submit', () => {
    const body = fnBody('runScanFlow');
    const awaitIdx = body.indexOf('await applyScanCode');
    const submitIdx = body.indexOf('submit()');
    expect(awaitIdx, 'runScanFlow 必须 await applyScanCode').toBeGreaterThan(-1);
    expect(submitIdx, 'runScanFlow 必须调用 submit()').toBeGreaterThan(-1);
    expect(awaitIdx, 'await 回填必须排在 submit 之前（否则 submit 读到空值，等于还要手点一次）')
      .toBeLessThan(submitIdx);
  });

  test('applyScanCode 必须返回 Promise（否则外层 await 等不到回填）', () => {
    const body = fnBody('applyScanCode');
    expect(body, 'applyScanCode 必须 return 出 Promise').toMatch(/return\s+scanEntry\(/);
    expect(body, '空码时也要 return 一个 Promise').toMatch(/if\s*\(!raw\)\s*return\s+Promise\.resolve\(\)/);
  });

  test('手动「立即查询」入口保留（扫码之外的正常查询路径不能被拆掉）', () => {
    expect(src).toMatch(/@click="submit"/);
    expect(src).toMatch(/立即查询/);
  });
});

describe('#522 独立活动广告位（不复用首页展示位）', () => {
  test('结果区存在活动广告位区块，且条件是 activity.enabled', () => {
    expect(src).toMatch(/class="tr-card tr-activity"/);
    expect(src).toMatch(/v-if="activity\.enabled"/);
    expect(src).toMatch(/openActivity/);
  });

  test('活动位数据来源是 result.activity（不是 slotList / displaySlots）', () => {
    const body = fnBody('activity');
    expect(body).toMatch(/result\.value\s*&&\s*result\.value\.activity/);
    expect(body, '活动位不得从展示位数组里取').not.toMatch(/slotList/);
    // 展示位仍走自己的通道，互不干扰
    expect(src).toMatch(/const slotList = computed/);
  });

  test('点击活动位走统一的链接基建（不复用展示位的 openSlot）', () => {
    const body = fnBody('openActivity');
    expect(body).toMatch(/execCompLink\(linkFromString\(a\.link\)\)/);
  });
});
