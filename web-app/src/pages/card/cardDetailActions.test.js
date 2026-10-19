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
// 4) 新增「视频号」入口，服务端下发 ownerIsVip 裁决；
// 5) 2026-10-22 用户明确「我要的是真实的功能，不要有这样的提示」：
//    - 删掉 ownerPreviewHint 整套假提示（改为真实执行 + 后端真错误回填）；
//    - 导航走 uni.openLocation 唤起手机地图 App（需主人选点落库的经纬度）；
//    - 分享走 MP button[open-type=share] 原生面板，不再 toast「请点击右上角分享」；
//    - 「关注 TA」正名为「交换名片」（它调的是 POST /exchange，语义与收藏完全不同）；
//    - 补回用户记得但缺失的「保存到通讯录」，MP 用 uni.addPhoneContact。

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

  test('八个操作项统一进 .act-grid 同一栅格（不再有主人态特例）', () => {
    expect(src).toMatch(/class="act-grid"/);
    // 4 列 × 2 行：拨号/收藏/交换名片/复制微信 + 导航/视频号/存通讯录/分享
    for (const item of ['callPhone', 'toggleCollect', 'followCard', 'copyWechat', 'navigateTo', 'openVideoChannel', 'saveContact', 'shareCard']) {
      expect(src, `${item} 未进 act-grid`).toMatch(new RegExp(`class="ag-item[^"]*"[^>]*@click="${item}"`));
    }
  });

  test('🔴 主人预览不拦任何操作：全真实执行，脏数据由后端真错误拦（2026-10-22 用户明确）', () => {
    // 用户原文：「我要的是真实的功能，不要有这样的提示」。
    // 曾经为了防「自拨号/自收藏/自交换」在前端塞 ownerPreviewHint 假提示，被否决。
    // 现在的口径：动作一律真跑，自操作由后端拒绝（/collect 与 /exchange 均已加自操作
    // 校验），前端 catch 后把后端真错误原样提示 —— 是「错误」而不是「演示」。
    expect(src).not.toMatch(/ownerPreviewHint/);
    expect(src).not.toMatch(/预览视角/);
    for (const fn of ['callPhone', 'copyWechat', 'navigateTo', 'toggleCollect', 'followCard']) {
      const body = src.slice(src.indexOf(`function ${fn}(`), src.indexOf(`function ${fn}(`) + 400);
      expect(body, `${fn} 被前端假提示拦住了`).not.toMatch(/ownerPreviewHint\(/);
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
    expect(src).toMatch(/视频号为会员权益，开通后自动展示/);
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

  test('格子等高 + 4 列宽度换算正确，主操作只靠主色区分而非尺寸', () => {
    const block = src.slice(src.indexOf('.ag-item {'), src.indexOf('.ag-t {'));
    expect(block).toMatch(/min-height:\s*88rpx/);
    expect(block).toMatch(/justify-content:\s*center/);
    // 🔴 content-box 下百分比宽度不含 padding+border → 4 列排成 3 列（3 列版已踩过一次）
    expect(block).toMatch(/box-sizing:\s*border-box/);
    // 4 列：4×(25% - 12rpx) + 3 个 16rpx 间隙 = 100%（间隙见 .act-grid 的 gap:16rpx）
    expect(block).toMatch(/width:\s*calc\(25% - 12rpx\)/);
    expect(src).toMatch(/gap:\s*16rpx/);
    expect(src).not.toMatch(/^\.hg-btn \{/m);
    expect(src).toMatch(/\.ag-item\.ag-primary \{/);
  });

  test('分享格是 button[open-type=share]，且抹掉了按钮自带样式', () => {
    // 🔴 小程序里 API 无法主动拉起转发面板，必须用 button open-type="share"；
    //    H5 没有该能力 → 降级复制链接，两条分支都不能退化成 toast。
    expect(src).toMatch(/<button class="ag-item ag-share" open-type="share"/);
    expect(src).toMatch(/\.ag-item\.ag-share \{/);
    expect(src).toMatch(/\.ag-item\.ag-share::after \{ border: none; \}/);
  });
});

describe('操作栏八格都是真动作（2026-10-22 用户明确：不要假提示）', () => {
  test('文案正名：视频号（不再「视频号主页」）、交换名片（不再「关注 TA」）', () => {
    expect(src).toMatch(/<text class="ag-t">视频号<\/text>/);
    expect(src).not.toMatch(/<text class="ag-t">视频号主页<\/text>/);
    expect(src).toMatch(/<text class="ag-t">交换名片<\/text>/);
    expect(src).not.toMatch(/<text class="ag-t">关注 TA<\/text>/);
    // 用户记得但确实缺的那格：保存到通讯录
    expect(src).toMatch(/<text class="ag-t">存通讯录<\/text>/);
  });

  test('导航：有经纬度走 uni.openLocation 唤起地图 App；无坐标时主人弹引导去补、访客降级复制', () => {
    // 🔴 截取到下一个函数为止（旧版写死 +900 字符，函数加长后尾部断言会假红）
    const navStart = src.indexOf('function navigateTo(');
    const body = src.slice(navStart, src.indexOf('function previewWork(', navStart));
    expect(body).toMatch(/uni\.openLocation\(\{/);
    expect(body).toMatch(/latitude:\s*lat/);
    expect(body).toMatch(/longitude:\s*lng/);
    // 坐标来自服务端下发的 card.latitude/longitude（名片主人在创建页用 chooseLocation 选点）
    expect(body).toMatch(/Number\(card\.value\.latitude\)/);
    expect(body).toMatch(/Number\(card\.value\.longitude\)/);
    // 🔴 非数字坐标在 MP 是静默失败（点了没反应），不能放行
    expect(body).toMatch(/Number\.isFinite\(lat\) && Number\.isFinite\(lng\)/);
    expect(body).toMatch(/uni\.setClipboardData/);
    // 2026-10-20 用户反馈「导航还是复制地址」：根因是名片没坐标。
    // 主人本人点导航 → 引导去编辑页补坐标（一次设置永久直开地图）；访客才复制地址。
    expect(body).toMatch(/isRealMine\.value/);
    expect(body).toMatch(/名片还没设置位置/);
    expect(body).toMatch(/\/pages\/card\/create\?id=/);
  });

  test('保存到通讯录：MP 走 uni.addPhoneContact，H5 降级复制名片文本', () => {
    expect(src).toMatch(/function saveContact\(\)/);
    expect(src).toMatch(/uni\.addPhoneContact\(\{/);
    expect(src).toMatch(/function copyCardText\(\)/);
    // 用户主动取消不打扰，其余失败降级复制
    expect(src).toMatch(/indexOf\('cancel'\) >= 0\) return;/);
  });

  test('分享：不再 toast「请点击右上角分享」，H5 复制真实链接', () => {
    expect(src).not.toMatch(/请点击右上角分享/);
    const body = src.slice(src.indexOf('function shareCard('), src.indexOf('function shareCard(') + 500);
    expect(body).toMatch(/uni\.setClipboardData/);
    expect(body).toMatch(/pages\/card\/cardDetail\?id=/);
  });

  test('视频号：MP 走 wx.openChannelsUserProfile 真跳转，失败给真原因', () => {
    // 🔴 截到下一个函数为止（写死宽度在 fail 回调加 cancel 守卫后会假红）
    const ovStart = src.indexOf('function openVideo(');
    const body = src.slice(ovStart, src.indexOf('function copyVideoChannelId(', ovStart));
    expect(body).toMatch(/wx\.openChannelsUserProfile/);
    expect(body).toMatch(/finderUserName:\s*ch/);
    expect(body).not.toMatch(/跳转视频号/);
    expect(body).toMatch(/视频号不存在/);
    // 取消（看一眼就返回）不算失败，静默返回
    expect(body).toMatch(/\/cancel\/i\.test\(String\(err\.errMsg\)\)/);
  });

  test('交换名片与收藏是两件事（语义写进代码注释，防止再被合成一格）', () => {
    expect(src).toMatch(/cardApi\.exchange/);
    expect(src).toMatch(/收藏=单向存进名片夹/);
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
