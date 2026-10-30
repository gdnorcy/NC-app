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

describe('#521 海报版式（大图在上 → 结论 → 广告位在下）', () => {
  test('结果区存在海报区，且与结果卡同门闸（showWebResult）', () => {
    // 🔴 push_dynamic 档位下网页结果整体不展示（只信公众号推来的结果），
    //    海报带着商品名与验真徽标 —— 不能绕过这道闸单独露出来。
    expect(src).toMatch(/class="tr-poster-card"/);
    expect(src).toMatch(/v-if="result && showWebResult"/);
  });

  test('海报图取批次主图 banner，缺省回落批次 logo', () => {
    const body = fnBody('posterImage');
    expect(body).toMatch(/b\.banner \|\| b\.logo/);
    expect(body).toMatch(/absOriginUrl/);
  });

  test('徽标文案区分试印码与已被查询（试印码不能说「验证通过」）', () => {
    const body = fnBody('posterBadge');
    expect(body).toMatch(/demo/);
    expect(body).toMatch(/已被查询/);
  });

  test('DOM 顺序：海报块 → 验真明细卡 → 活动位（推荐位已移除，广告位在最后）', () => {
    const posterIdx = src.indexOf('class="tr-poster-card"');
    const detailIdx = src.indexOf('class="tr-card tr-detail"');
    const actIdx = src.indexOf('class="tr-card tr-activity"');
    expect(posterIdx).toBeGreaterThan(-1, '海报块必须存在');
    expect(detailIdx).toBeGreaterThan(posterIdx, '验真明细卡必须在海报之后');
    expect(actIdx).toBeGreaterThan(detailIdx, '活动位必须在明细卡之后');
    // 🔴 推荐位（tr-slots）已整体移除
    expect(src, '推荐展示位必须已移除').not.toMatch(/class="tr-card tr-slots"/);
  });

  test('推荐位整体移除（用户要求，不再渲染 tr-slots / tr-slot）', () => {
    expect(src, '模板不得再出现推荐位区块').not.toMatch(/class="tr-card tr-slots"/);
    expect(src, '模板不得再出现单个推荐位').not.toMatch(/class="tr-slot"/);
    expect(src, '样式不得残留 tr-slots 规则').not.toMatch(/\.tr-slots-title/);
    expect(src, '样式不得残留 tr-slot 规则').not.toMatch(/\.tr-slot \{/);
  });

  test('海报用指定红金底图做背景，且整页只有一个 pushImg 二维码（杜绝两个码）', () => {
    // 🔴 用户明确：用 poster-bg.jpg 作底图 + 叠加文字 + 一个二维码；
    //    之前 tr-card-push 又放了一遍 pushImg → 出现两个码，本版必须只有海报里的那一个。
    expect(src).toMatch(/src="\/static\/trace\/poster-bg\.jpg"/);
    const qrCount = (src.match(/tr-poster-qr-img" :src="pushImg"/g) || []).length;
    expect(qrCount, '海报里应恰好有一个 pushImg 二维码').toBe(1);
    expect(src, '不得再出现第二个推送引导卡里的 pushImg 图').not.toMatch(/class="tr-push-img" :src="pushImg"/);
    expect(src, '推送引导卡整体已移除').not.toMatch(/tr-card-push/);
  });

  test('演示说明单独放在「查询结果」位置（海报之前，替代原「查询结果」标题）', () => {
    // 🔴 用户要求：试印说明从海报内移出，作为结果区顶部独立说明（演示码才显示）。
    const demoIdx = src.indexOf('【演示·试印】本码为印刷前试印码');
    const posterIdx = src.indexOf('class="tr-poster-card"');
    const frameIdx = src.indexOf('class="tr-poster-frame"');
    expect(demoIdx, '试印说明文案必须存在').toBeGreaterThan(-1);
    expect(posterIdx, '海报块必须存在').toBeGreaterThan(-1);
    expect(frameIdx, '底图容器必须存在').toBeGreaterThan(-1);
    expect(demoIdx, '试印说明必须排在海报之前（在查询结果位置）').toBeLessThan(posterIdx);
    // 海报内不再重复放试印提示
    expect(src, '海报内不得再出现 tr-poster-demo').not.toMatch(/class="tr-poster-demo"/);
    // 🔴 绑定名必须与脚本常量一致：曾写成 {{ demoNote }}（常量实际是 DEMO_NOTE）
    //    → 模板拿到 undefined，试印说明渲染成空白，且常量被摇树掉（产物里搜不到文案）。
    expect(src).toMatch(/\{\{ DEMO_NOTE \}\}/);
    expect(src).not.toMatch(/\{\{ demoNote \}\}/);
    expect(src).toMatch(/const DEMO_NOTE = /);
  });

  test('海报内嵌公众号引导二维码（pushImg，整页唯一）+ 操作引导文案', () => {
    expect(src).toMatch(/class="tr-poster-qr-img" :src="pushImg"/);
    expect(src).toMatch(/进入认证公众号查看验真结果/);
  });
});

// #527 扫码直接出结果（用户 2026-10-30 反馈：扫二维码还是「防伪查询 + 立即查询」那个界面）
describe('#527 扫码直接出结果（不再停在表单页）', () => {
  test('网页结果任何档位都展示（push_dynamic 不再把结果藏起来）', () => {
    // 🔴 之前 showWebResult = !pushMode || pushErr → 「公众号推送」档位下
    //    扫码进来只有「请在公众号内查看验真结果」，看不到海报版式，等于这一档没有结果。
    expect(src).toMatch(/const showWebResult = computed\(\(\) => true\);/);
  });

  test('查完把输入表单收起来，只留「换个码再查」', () => {
    expect(src).toContain('class="tr-recheck"');
    expect(src).toMatch(/reQuery\.value = false;/);
    expect(src).toMatch(/const reQuery = ref\(false\);/);
  });

  test('公众号推送降级为并行补充（文案不再说「只有公众号才有结果」）', () => {
    // 推送语义现在落到海报叠加文案里（POSTER_NOTE），不再另起一张「请在公众号内查看」的卡
    expect(src).toContain('为防止假冒查询页面，本产品的验真结果由商家认证公众号推送。');
    // 模板里不能再有旧的「只有公众号才有结果」标题（注释里复述用户反馈可以保留）
    expect(src).not.toContain('class="tr-card-title">请在公众号内查看验真结果');
  });

  test('海报块仍排在活动位之前（版式顺序没被改动打乱）', () => {
    const posterIdx = src.indexOf('class="tr-poster-card"');
    const actIdx = src.indexOf('class="tr-card tr-activity"');
    expect(posterIdx).toBeGreaterThan(-1);
    expect(actIdx).toBeGreaterThan(posterIdx);
  });

  test('扫码进入不再闪「防伪查询」表单（加载期间只显示占位，不渲染输入框+立即查询）', () => {
    // 🔴 用户反馈：扫码先闪一下「防伪查询」输入框 + 「立即查询」按钮。
    //    现：scanEntry 标记下，加载态显示「查询中…」占位，输入框块用 v-else-if 收起。
    expect(src).toMatch(/const enteredByScan = ref\(false\)/);
    expect(src).toMatch(/enteredByScan\.value = true/);
    expect(src).toMatch(/class="tr-loading"/);
    // 原「结果回来前还显示防伪查询表单」的写法必须消失（标题三元已改写）
    expect(src).not.toContain("{{ result && !reQuery ? '查询结果' : '防伪查询' }}");
  });

  test('演示码不显示「演示码验证通过」标题块（明细卡标题按 !result.demo 收起）', () => {
    expect(src).toMatch(/class="tr-result-head" v-if="!result\.demo"/);
  });
});

// #531 验真提示按「查询次数」分档（用户反馈：35 次却显示「二次查询提示」）
describe('#531 验真提示分档（首次 / 二次 / 三次及以后 / 超限）', () => {
  test('successTip 按累计次数 num 分档，不再只看 result.first 二选一', () => {
    const body = fnBody('successTip');
    // 必须读累计次数与上限阈值
    expect(body).toMatch(/result\.value\.num/);
    expect(body).toMatch(/s\.upperlimit/);
    // 四档都要出现：超限 → 首次 → 二次 → 三次及以后
    expect(body).toMatch(/s\.conMsg/);
    expect(body).toMatch(/s\.sucOne/);
    expect(body).toMatch(/s\.sucTwo/);
    expect(body).toMatch(/s\.sucThree/);
    expect(body).toMatch(/num <= 1/);
    expect(body).toMatch(/num === 2/);
    // 🔴 不能再退化成「首查布尔二选一」——那正是 35 次显示二次提示的根因
    expect(body).not.toMatch(/const isFirst = /);
    expect(body).not.toMatch(/isFirst \? /);
  });

  test('分档顺序：超限优先，其次首次 / 二次 / 三次及以后', () => {
    const body = fnBody('successTip');
    const overIdx = body.indexOf('limit > 0 && num >= limit');
    const oneIdx = body.indexOf('num <= 1');
    const twoIdx = body.indexOf('num === 2');
    expect(overIdx, '超限档必须先判').toBeGreaterThan(-1);
    expect(overIdx, '超限优先于首次').toBeLessThan(oneIdx);
    expect(oneIdx, '首次先于二次').toBeLessThan(twoIdx);
  });

  test('档位为空时回退到相邻档位（不留白）', () => {
    const body = fnBody('successTip');
    // 三次为空时回退二次：s.sucThree || s.sucTwo || s.sucOne
    expect(body).toMatch(/s\.sucThree \|\| s\.sucTwo \|\| s\.sucOne/);
  });
});
