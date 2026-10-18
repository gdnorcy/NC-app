import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 名片详情页：访客预览下线 + 操作栏栅格 + 悬浮换模板入口 + 转发分享。
//
// 演进（2026-10-18 ~ 10-21）：
// 1) 用户报修「操作栏预览看不到」→ 做过 ?preview=1 访客视角 + 右侧悬浮双丸；
// 2) 用户复看后决定：「没必要专门做一个访客视觉，直接做一个浮条做换模板功能就可以」
//    → 预览模式整体下线，悬浮只留「换模板」一丸；
// 3) 同轮报修「操作栏头重脚轻」→ 拨号/收藏大按钮 + 小图标两层结构合并为等高栅格。

const src = readFileSync(fileURLToPath(new URL('./cardDetail.vue', import.meta.url)), 'utf8');
const mySrc = readFileSync(fileURLToPath(new URL('./myCard.vue', import.meta.url)), 'utf8');

describe('访客视角预览已下线（2026-10-21 用户决策）', () => {
  test('cardDetail 不再有 previewMode / 只读守卫 / 预览浮条', () => {
    expect(src).not.toMatch(/previewMode/);
    expect(src).not.toMatch(/previewBlocked/);
    expect(src).not.toMatch(/class="pv-bar"/);
    expect(src).not.toMatch(/enterPreview|exitPreview/);
    // 🔴 只断言模板 class 查不到 CSS 死代码：上线后产物 CSS 里仍残留 .pv-bar
    //    三条规则（模板已无对应元素 = 死样式，白占 token）。样式也必须清干净。
    expect(src).not.toMatch(/\.pv-bar[\s{]/);
    expect(src).not.toMatch(/\.fr-exit[\s{]/);
    // 路由不再解析 preview=1（注释里允许提及）
    expect(src.replace(/\/\/[^\n]*/g, '')).not.toMatch(/options\.preview/);
  });

  test('isMine 回归单一判据（本人 = 名片归属人）', () => {
    expect(src).toMatch(/const isMine = computed\(\(\) => isRealMine\.value\)/);
  });

  test('myCard 预览入口不再传 preview=1', () => {
    expect(mySrc).toMatch(/function previewCard\(\)[\s\S]*?cardDetail\?id=\$\{pageCardId\.value\}`/);
    // 只允许注释里提到 preview=1，代码里不得再传
    const code = mySrc.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/preview=1/);
    expect(code).not.toMatch(/opts\.preview/);
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

  test('六个操作项统一进 .act-grid 同一栅格', () => {
    expect(src).toMatch(/class="act-grid"/);
    for (const item of ['callPhone', 'toggleCollect', 'followCard', 'copyWechat', 'navigateTo', 'shareCard']) {
      expect(src, `${item} 未进 act-grid`).toMatch(new RegExp(`class="ag-item[^"]*"[^>]*@click="${item}"`));
    }
  });

  test('格子等高：min-height + 居中，主操作只靠主色区分而非尺寸', () => {
    const block = src.slice(src.indexOf('.ag-item {'), src.indexOf('.ag-t {'));
    expect(block).toMatch(/min-height:\s*88rpx/);
    expect(block).toMatch(/justify-content:\s*center/);
    // 不得再有 flex:1 撑满通栏的旧hg-btn 尺寸差
    expect(src).not.toMatch(/^\.hg-btn \{/m);
    // 主操作=主色底，不靠更大字号/更高
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
    expect(src).toMatch(/function measureRailTop\(\)/);
    expect(src).toMatch(/select\('\.mp-tabs'\)/);
    expect(src).toMatch(/rect\.bottom \+ 16/);
    expect(src).toMatch(/const railTop = ref\(0\)/);
    expect(src).toMatch(/const railStyle = computed\(\(\) => \(railTop\.value > 0 \? \{ top: railTop\.value \+ 'px' \} : \{\}\)\)/);
    expect(src).toMatch(/setTimeout\(measureRailTop, 60\)/);
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
