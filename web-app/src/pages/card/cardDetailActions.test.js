import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 名片详情页：访客预览下线 + 操作栏栅格 + 悬浮换模板入口 + 转发分享。
//
// 演进（2026-10-18）：
// 1) 用户报修「操作栏预览看不到」→ 做过 ?preview=1 访客视角 + 右侧悬浮双丸；
// 2) 中途我把「没必要专门做访客视觉」误解成「撤掉访客预览」，改成主人态只显示分享
//    → 用户纠正：**预览 ≡ 访客视角，访客看到什么预览里就有什么**，唯一多出来的装饰
//      是右上角悬浮的换模板丸。本条务必别再退回去；
// 3) 操作栏拨号/收藏大按钮 + 小图标两层结构合并为等高栅格（修「头重脚轻」）；
// 4) 新增「视频号主页」入口，服务端下发 ownerIsVip 裁决。

const src = readFileSync(fileURLToPath(new URL('./cardDetail.vue', import.meta.url)), 'utf8');
const mySrc = readFileSync(fileURLToPath(new URL('./myCard.vue', import.meta.url)), 'utf8');

describe('预览 ≡ 访客视角（2026-10-18 用户明确，勿退成主人态）', () => {
  test('操作栏不再按 isMine 裁剪任何格子', () => {
    // 🔴 曾经写成 v-if="!isMine && card.phone"，导致主人预览只看到「分享」一格，
    //    与「访客看到什么预览里就有什么」直接冲突。
    expect(src).not.toMatch(/v-if="!isMine/);
    expect(src).not.toMatch(/&& !isMine"/);
    expect(src).not.toMatch(/isMine \? 'ag-mine' : ''/);
    expect(src).not.toMatch(/\.act-grid\.ag-mine[\s{]/);
  });

  test('七个操作项统一进 .act-grid 同一栅格（不再有主人态特例）', () => {
    expect(src).toMatch(/class="act-grid"/);
    for (const item of ['callPhone', 'toggleCollect', 'followCard', 'copyWechat', 'navigateTo', 'openVideoChannel', 'shareCard']) {
      expect(src, `${item} 未进 act-grid`).toMatch(new RegExp(`class="ag-item[^"]*"[^>]*@click="${item}"`));
    }
  });

  test('主人预览只拦副作用不改视觉：ownerPreviewHint 存在且被访客向操作调用', () => {
    // 视觉一律按访客态渲染，但自己拨自己电话/收藏自己名片会写脏数据。
    expect(src).toMatch(/function ownerPreviewHint\(/);
    for (const fn of ['callPhone', 'copyWechat', 'navigateTo', 'toggleCollect', 'followCard']) {
      const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf(`function ${fn}(`) + 300);
      expect(body, `${fn} 未拦主人预览副作用`).toMatch(/ownerPreviewHint\(/);
    }
  });

  test('旧预览模式残留全清（previewMode / 预览浮条 / 只读守卫）', () => {
    expect(src).not.toMatch(/previewMode/);
    expect(src).not.toMatch(/previewBlocked/);
    expect(src).not.toMatch(/class="pv-bar"/);
    expect(src).not.toMatch(/enterPreview|exitPreview/);
    // 🔴 只断言模板 class 查不到 CSS 死代码：曾经元素删了 CSS 还在，产物里照样命中。
    expect(src).not.toMatch(/\.pv-bar[\s{]/);
    expect(src).not.toMatch(/\.fr-exit[\s{]/);
    expect(src.replace(/\/\/[^\n]*/g, '')).not.toMatch(/options\.preview/);
  });

  test('isMine 仍是单一判据，且只用于悬浮丸与预览副作用拦截', () => {
    expect(src).toMatch(/const isMine = computed\(\(\) => isRealMine\.value\)/);
    expect(src).toMatch(/class="float-rail" v-if="isRealMine" :style="railStyle"/);
  });

  test('myCard 预览入口不带 preview=1（预览就是普通访客视角）', () => {
    expect(mySrc).toMatch(/function previewCard\(\)[\s\S]*?cardDetail\?id=\$\{pageCardId\.value\}`/);
    const code = mySrc.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/preview=1/);
    expect(code).not.toMatch(/opts\.preview/);
  });
});

describe('视频号主页入口（按名片主人是否会员裁决）', () => {
  test('ownerIsVip 由服务端下发，前端只消费布尔不自算过期', () => {
    // 会员判据必须单一来源在服务端（radarMember 口径：非 free 且未过期）；
    // C 端若自己解析 SQLite 的 'YYYY-MM-DD HH:MM:SS'，MP 端 new Date() 会 Invalid。
    expect(src).toMatch(/const ownerIsVip = computed\(\(\) => !!card\.value\.ownerIsVip\)/);
    expect(src).not.toMatch(/member_expire_at/);
  });

  test('入口恒显示：不置灰、不加锁、不判 ownerIsVip 决定是否渲染', () => {
    const gridStart = src.indexOf('<view class="act-grid"');
    const gridEnd = src.indexOf('</view>', src.indexOf('@click="shareCard"'));
    const grid = src.slice(gridStart, gridEnd);
    expect(grid).toMatch(/@click="openVideoChannel"/);
    // 它反映的是「名片主人」有没有开通，不是给访客设门槛 → 无条件渲染
    expect(grid).not.toMatch(/v-if="[^"]*ownerIsVip/);
  });

  test('点击三分支：非会员 / 会员未填号 / 会员有号', () => {
    expect(src).toMatch(/function openVideoChannel\(\)/);
    // ① 主人非会员：访客被告知未开通，主人自己进则引导开会员
    expect(src).toMatch(/名片主人暂未开通视频号/);
    expect(src).toMatch(/视频号主页为会员权益，开通后自动展示/);
    // ② 会员但没填视频号
    expect(src).toMatch(/名片主人暂未设置视频号/);
    expect(src).toMatch(/请先在名片资料里填写视频号/);
    // ③ 会员 + 有号 → 走原视频号跳转
    expect(src.slice(src.indexOf('function openVideoChannel'), src.indexOf('function openVideoChannel') + 1400)).toMatch(/openVideo\(\)/);
  });
});

describe('hero 操作栏：等高栅格（修「头重脚轻」）', () => {
  // 根因：旧结构是「hero-guide 两个通栏大按钮（flex:1 + 高 78rpx）」+
  //      「quickbar 一排 23% 宽小卡」两层，上层又宽又高、下层又窄又矮 → 头重脚轻。
  test('旧的两层结构（hero-guide / quickbar）已移除', () => {
    expect(src).not.toMatch(/class="hero-guide"/);
    expect(src).not.toMatch(/class="quickbar"/);
    expect(src).not.toMatch(/^\.hero-guide \{/m);
    expect(src).not.toMatch(/^\.quickbar \{/m);
  });

  test('格子等高：min-height + 居中 + border-box，主操作只靠主色区分而非尺寸', () => {
    const block = src.slice(src.indexOf('.ag-item {'), src.indexOf('.ag-t {'));
    expect(block).toMatch(/min-height:\s*88rpx/);
    expect(block).toMatch(/justify-content:\s*center/);
    // 🔴 content-box 下 width:31.5% 不含 padding+border → 三列排成两列
    expect(block).toMatch(/box-sizing:\s*border-box/);
    expect(src).not.toMatch(/^\.hg-btn \{/m);
    expect(src).toMatch(/\.ag-item\.ag-primary \{/);
  });
});

describe('右侧悬浮入口（仅换模板一丸）', () => {
  test('悬浮轨仅名片主人可见，内容只有换模板', () => {
    expect(src).toMatch(/class="float-rail" v-if="isRealMine" :style="railStyle"/);
    expect(src).toMatch(/class="fr-btn" @click="goTemplateSelect"/);
    expect(src).not.toMatch(/@click="enterPreview"/);
    expect(src).not.toMatch(/fr-exit/);
  });

  test('纵向位置由 mp-tabs 实测底沿决定（非写死百分比）', () => {
    // 写死百分比必被某套版式打中：11 套实测 top:42% 压 tabs、58% 压全幅 pano。
    expect(src).toMatch(/function measureRailTop\(onBottom\)/);
    expect(src).toMatch(/if \(onBottom\) onBottom\(tabsRect\.bottom\)/);
    // 🔴 上限不能再用 tabbarH 估算：估算值 ~72px 比 TabBar 实际占位 60px 大，
    //    把上限压进 tabs 区间 → 丸压住「视频」页签（tpl22 实测）。必须实测顶沿。
    expect(src).toMatch(/select\('\.mp-tabbar'\)/);
    expect(src).toMatch(/upperByBar = barRect && barRect\.top \? barRect\.top - RAIL_H - GAP : null/);
    expect(src).toMatch(/upper = Math\.max\(TOP_MIN, upperByBar \|\| upperByEst\)/);
    expect(src).toMatch(/select\('\.mp-tabs'\)/);
    expect(src).toMatch(/tabsRect\.bottom \+ GAP \* 2/);
    expect(src).toMatch(/const railTop = ref\(0\)/);
    expect(src).toMatch(/const railStyle = computed\(\(\) => \(railTop\.value > 0 \? \{ top: railTop\.value \+ 'px' \} : \{\}\)\)/);
    // 🔴 只能测一次的话会过期：hero 因图片异步加载继续变高，tabs 底沿下移
    //    → 丸停在旧位置压住页签（tpl22 实测重叠 2px；阶梯延时到 700ms 仍不够）。
    //    改成轮询到 tabs 底沿稳定为止。
    expect(src).toMatch(/function scheduleRailMeasure\(\)/);
    // 卸载必须清定时器，且只能用 uni-app 的 onUnload（本文件未 import vue 的 onUnmounted，
    // 用错钩子或未 import 会让 setup 直接抛 → 整页白屏）
    expect(src).toMatch(/onUnload\(\(\) => \{[\s\S]{0,80}clearInterval\(railTimer\)/);
    expect(src).not.toMatch(/setTimeout\(measureRailTop, 60\)/);
  });

  test('goTemplateSelect 仍校验本人（防体验版/分享链路误入）', () => {
    expect(src).toMatch(/function goTemplateSelect\(\)\s*\{\s*if \(!isMine\.value\) return;/);
  });

  test('白胶囊描边用主色（浅色 hero 上白底对底仅 1.13:1，等于糊掉）', () => {
    const block = src.slice(src.indexOf('.fr-btn {'), src.indexOf('.fr-lab {'));
    expect(block).toMatch(/border:\s*1rpx solid var\(--design-primary\)/);
  });
});

describe('cardDetail 转发分享配置', () => {
  test('import onShareAppMessage 并定义转发内容', () => {
    expect(src).toMatch(/import \{[^}]*onShareAppMessage[^}]*\} from '@dcloudio\/uni-app'/);
    expect(src).toMatch(/onShareAppMessage\(\(\) => \{/);
  });

  test('转发标题=姓名·职位·公司，路径带名片 id，头像需完整 URL', () => {
    expect(src).toMatch(/\[c\.name, c\.position, c\.company\]\.filter\(Boolean\)\.join\(' · '\)/);
    expect(src).toMatch(/path: `\/pages\/card\/cardDetail\?id=\$\{c\.id \|\| ''\}`/);
    expect(src).toMatch(/imageUrl: \/\^https\?:\/\.test\(c\.avatar \|\| ''\) \? c\.avatar : ''/);
  });
});
