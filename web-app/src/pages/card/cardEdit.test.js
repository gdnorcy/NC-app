import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from './cardCompRegistry.js';

// 名片自定义装修组件（2026-10-20 V1）回归：
//  - cardEdit.vue 结构：母版置灰、整存只提交个人组件、品牌链完整、数量上限同源
//  - cardDetail.vue 渲染：加载并渲染合并组件（母版+个人）
//  - myCard.vue 入口：编辑列表跳 cardEdit
//  - server COMP_MAX 与前端常量一致（跨包钉）
const cardEditSrc = readFileSync(fileURLToPath(new URL('./cardEdit.vue', import.meta.url)), 'utf8');
const cardDetailSrc = readFileSync(fileURLToPath(new URL('./cardDetail.vue', import.meta.url)), 'utf8');
// 装修组件的唯一渲染源（详情页 + 装修页共用）
// 🔴 断言「旧实现已移除」时必须用剥注释版：源码里那段「原来是 .cc-notice-dot」的
//    说明注释含同样字面量，直接正则会连注释一起命中 → 假失败。
const cardCompItemSrcRaw = readFileSync(fileURLToPath(new URL('../../components/CardCompItem.vue', import.meta.url)), 'utf8');
const cardCompItemSrc = cardCompItemSrcRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const myCardSrc = readFileSync(fileURLToPath(new URL('./myCard.vue', import.meta.url)), 'utf8');
const serverCard = readFileSync(fileURLToPath(new URL('../../../../server/src/routes/card.js', import.meta.url)), 'utf8');

describe('cardEdit.vue 装修编辑页', () => {
  test('数据来源：getCardComponents / saveCardComponents（整存 PUT）', () => {
    expect(cardEditSrc).toMatch(/cardApi\.getCardComponents\(/);
    expect(cardEditSrc).toMatch(/cardApi\.saveCardComponents\(/);
    expect(cardEditSrc).toMatch(/mine\.value\.map\(\(c\) => \(\{ type: c\.type, props: c\.props \|\| \{\} \}\)\)/);
  });

  test('品牌链：根视图绑 themeStyle + brandVars（禁硬编码微信绿）', () => {
    expect(cardEditSrc).toMatch(/:style="\[themeStyle, brandVars\]"/);
    // CSS 里不出现微信绿硬编码（tokenAudit 已扫裸值，这里钉语义）
    const style = cardEditSrc.slice(cardEditSrc.indexOf('<style scoped>'));
    expect(style).not.toContain('#07c160');
  });

  test('母版锁定：isLock 项操作按钮置灰 + 锁标记常驻（不随选中态隐掉）', () => {
    expect(cardEditSrc).toMatch(/:class="\{ lock: c\.isLock, off: c\.props && c\.props\.hidden \}"/);
    expect(cardEditSrc).toMatch(/off: c\.isLock \|\|/);
    // 锁标记常驻左上角：操作条是「选中才浮现」的，锁状态不能跟着隐掉，
    // 否则用户不知道这张为何不能改（旧的「不可修改」文字行已由它取代）
    expect(cardEditSrc).toMatch(/<text v-if="c\.isLock" class="ce-lock-badge">企业母版<\/text>/);
    expect(cardEditSrc).toMatch(/\.ce-lock-badge \{[\s\S]*?position: absolute/);
  });

  test('母版永在个人组件前（canMove 不允许穿越母版）', () => {
    expect(cardEditSrc).toMatch(/return !comps\.value\[i\]\.isLock && !comps\.value\[j\]\.isLock/);
  });

  test('新增组件后直接进配置弹窗（必填项当场补）', () => {
    expect(cardEditSrc).toMatch(/comps\.value\.push\(item\);[\s\S]*?openEdit\(item\)/);
  });

  test('数量上限与 server COMP_MAX 一致（20）', () => {
    expect(cardEditSrc).toContain('const COMP_MAX = 20;');
    expect(serverCard).toMatch(/const COMP_MAX = 20;/);
  });

  test('图片上传走通用上传（uploadUserAvatar），非自建上传链路', () => {
    expect(cardEditSrc).toMatch(/cardApi\.uploadUserAvatar\(f\.tempFilePath(,\s*f\.file)?\)/);
  });
});

describe('cardDetail.vue 组件渲染', () => {
  test('加载并渲染自定义组件区（母版+个人）', () => {
    expect(cardDetailSrc).toMatch(/cardApi\.getCardComponents\(id\)/);
    expect(cardDetailSrc).toMatch(/cardComps\.value = cc\.components \|\| \[\]/);
    expect(cardDetailSrc).toContain('class="cc-list"');
  });

  test('七种组件都有渲染分支（与注册表类型一一对应；渲染已迁到共享组件）', () => {
    for (const t of ['image', 'channel-video', 'notice', 'divider', 'spacer', 'button', 'rich-text']) {
      expect(cardCompItemSrc, `CardCompItem 缺少 ${t} 渲染分支`).toContain(`type === '${t}'`);
    }
  });

  test('详情页不再自带一份渲染：用共享组件，防两端漂移', () => {
    expect(cardDetailSrc).toMatch(/<CardCompItem v-for="\(c, i\) in shownComps"/);
    expect(cardDetailSrc).toMatch(/import CardCompItem from '\.\.\/\.\.\/components\/CardCompItem\.vue'/);
    // 负向：cc-* 结构与 cc* 助手函数不允许再留在详情页（删了 panel 忘删代码会被测试放过）
    for (const dead of ['function ccStyle(', 'function ccBtnStyle(', 'function ccRichStyle(', 'function sanitizeRichHtml(', 'function jumpCompLink(']) {
      expect(cardDetailSrc, `cardDetail 仍残留 ${dead}`).not.toContain(dead);
    }
  });

  test('视频号走 openChannelVideo（finderUserName + feedId）', () => {
    expect(cardCompItemSrc).toMatch(/openChannelVideo\(props\.value\)/);
  });

  test('组件边距助手存在（props px → 内联样式）', () => {
    expect(cardCompItemSrc).toMatch(/marginTop: \(p\.marginTop \|\| 0\) \+ 'px'/);
  });
});

describe('myCard.vue 入口', () => {
  test('编辑列表有「装修我的名片」入口，跳 cardEdit 带名片 id', () => {
    expect(myCardSrc).toContain('装修我的名片');
    expect(myCardSrc).toMatch(/uni\.navigateTo\(\{ url: `\/pages\/card\/cardEdit\?id=\$\{pageCardId\.value\}` \}\)/);
  });
});

describe('注册表与页面消费一致', () => {
  test('cardEdit 面板遍历 CARD_COMP_REGISTRY（不另写类型清单）', () => {
    expect(cardEditSrc).toMatch(/v-for="t in CARD_COMP_REGISTRY"/);
  });

  test('新增组件用 compDefaultProps 深拷贝默认值（含 hidden 初始位）', () => {
    expect(cardEditSrc).toMatch(/props: \{ \.\.\.compDefaultProps\(type\), hidden: false \}/);
    // 深拷贝验证：改返回值不污染注册表
    const p = compDefaultProps('notice');
    p.text = '改坏了';
    expect(compDefaultProps('notice').text).not.toBe('改坏了');
    expect(getCompDef('notice').defaultProps.text).not.toBe('改坏了');
    expect(CARD_COMP_REGISTRY).toHaveLength(9);
  });
});

describe('配置弹窗控件形态（2026-10-22 样式报修回归锁）', () => {
  test('input 用视图包层承载边框/box-sizing，内层原生控件去边框只 width:100%（防 MP 溢出）', () => {
    // 病根演进：① 只设 padding → MP 矮到一行；② width:100%+box-sizing:border-box → MP 按 100%+padding 撑宽溢出；
    //   ③ 去掉 width（对齐 customers.vue）→ MP 原生 input 不设宽反而默认更宽仍溢出。
    // 终解：用 .ce-input-wrap 视图包一层，边框/圆角/box-sizing 落在 view（MP 对 view 可靠），
    //   原生 input/textarea 去边框去 padding、只 width:100% 填满包层，MP/H5 都不溢出。
    const style = cardEditSrc.slice(cardEditSrc.indexOf('<style scoped>'));
    expect(style).toMatch(/\.ce-input-wrap\s*\{[^}]*box-sizing:\s*border-box/);
    expect(style).toMatch(/\.ce-input-wrap\s*\{[^}]*border:\s*1rpx solid var\(--border\)/);
    expect(style).toMatch(/\.ce-input\s*\{[^}]*height:\s*80rpx/);
    expect(style).toMatch(/\.ce-input\s*\{[^}]*padding:\s*0\s+var\(--space-r4\)/);
    expect(style).toMatch(/\.ce-input\s*\{[^}]*border:\s*none/);
    // 水平 padding 改由内层 ce-modal-pad 承载，scroll-view 不再直接 padding（避免 MP 尺寸退化）
    expect(style).toMatch(/\.ce-modal-pad\s*\{[^}]*padding:\s*var\(--space-r3\)\s+var\(--space-r6\)/);
  });

  test('richtext 控件已实现（textarea 输 HTML 源码）', () => {
    expect(cardEditSrc).toMatch(/f\.control === 'richtext'/);
    expect(cardEditSrc).toContain('class="ce-textarea"');
  });

  test('schema when 条件显隐：editFields 分组渲染 + fieldVisible', () => {
    // 病根：同元素 v-for+v-if 拿不到作用域变量；条件字段（描边色/宽度百分比）必须整行隐藏
    expect(cardEditSrc).toMatch(/<template v-for="f in editFields"/);
    expect(cardEditSrc).toMatch(/v-else-if="fieldVisible\(f\) && \(f\.section !== 'style' \|\| styleOpen\)"/);
    expect(cardEditSrc).toMatch(/function fieldVisible\(f\)[\s\S]*?f\.when/);
  });

  test('图片加载失败回退上传占位（示例图走网络图，真机域名没配会裂）', () => {
    expect(cardEditSrc).toMatch(/@error="onImgError\(f\.key\)"/);
    expect(cardEditSrc).toMatch(/const imgFailed = ref\(new Set\(\)\)/);
    expect(cardEditSrc).toMatch(/function onImgError\(key\)/);
  });

  test('弹窗滚动区显式定高（MP scroll-view 需确定高度才滚动，flex:1 不定高会顶出弹窗压住按钮）', () => {
    // 病根：flex:1+min-height:0 在 H5 有效，MP 端 scroll-view 不定高 → 不滚、内容溢出弹窗
    const style = cardEditSrc.slice(cardEditSrc.indexOf('<style scoped>'));
    expect(style).toMatch(/\.ce-modal-body\s*\{[^}]*flex:\s*none/);
    expect(style).toMatch(/\.ce-modal-body\s*\{[^}]*height:\s*46vh/);
  });
});

describe('共享渲染组件 CardCompItem（详情页与装修页唯一渲染源）', () => {
  test('按钮宽度走共享 buttonSizeStyle（禁私藏副本）', () => {
    expect(cardCompItemSrc).toMatch(/import \{ buttonSizeStyle \} from '\.\.\/utils\/btnSize\.js'/);
    expect(cardCompItemSrc).toMatch(/Object\.assign\(s, buttonSizeStyle\(p\), \{ maxWidth: '100%' \}\)/);
  });

  test('富文本渲染前消毒（剥 script/style/on*/javascript:）', () => {
    expect(cardCompItemSrc).toMatch(/function sanitizeRichHtml\(h\)/);
    // 分组+反向引用形态：禁拆成含 <script>/<style 字面量的两条（测试提取会误吞 script 段）
    expect(cardCompItemSrc).toMatch(/<\(script\|style\)\[\\s\\S\]\*\?<\\\/\\1>/i);
    expect(cardCompItemSrc).toMatch(/\\son\[a-z\]\+\\s\*=/);
    expect(cardCompItemSrc).toMatch(/javascript\\s\*:/);
    expect(cardCompItemSrc).toMatch(/:nodes="sanitizeRichHtml\(/);
  });

  test('富文本样式与 admin richTextStyle 对齐（compBgColor/圆角/投影/描边）', () => {
    expect(cardCompItemSrc).toMatch(/background: p\.compBgColor \|\| 'transparent'/);
  });

  test('装修页：列表即渲染（所见即所得）+ 预览层复用同一组件', () => {
    expect(cardEditSrc).toMatch(/import CardCompItem from '\.\.\/\.\.\/components\/CardCompItem\.vue'/);
    expect(cardEditSrc).toMatch(/<CardCompItem :comp="c" :interactive="false" \/>/);
    expect(cardEditSrc).toMatch(/<CardCompItem :comp="c" \/>/);
    // 负向：装修页不再自带渲染分支（否则 = 第三份实现，必漂移）
    for (const dead of ["v-if=\"c.type === 'image'", "v-else-if=\"c.type === 'button'", 'pvMarginStyle', 'pvBtnStyle', 'pvRichStyle', 'function sanitizeRichHtml(']) {
      expect(cardEditSrc, `cardEdit 仍残留 ${dead}`).not.toContain(dead);
    }
  });
});

describe('图片上传修复（相对 /uploads 资源必须解析为绝对 URL）', () => {
  test('上传返回的是相对 /uploads 路径，渲染层必须 resolveAssetUrl 转绝对（MP/H5 才能加载）', () => {
    // 病根：服务端 avatar-upload 返回相对 URL `/uploads/xxx`；
    //   MP 的 <image> 不支持相对路径（需完整 https）；H5 uni-app 会基于页面 base（/card/）解析 → 404。
    //   两者都会导致「上传成功但图片不显示」= 用户感知的「上传图片不成功」。
    expect(cardCompItemSrc).toMatch(/:src="resolveAssetUrl\(props\.url\)"/);
    expect(cardCompItemSrc).toMatch(/:src="resolveAssetUrl\(props\.cover\)"/);
    // 装修弹窗里的图片预览同样要走绝对化（否则点完上传仍显示「上传图片」空占位）
    expect(cardEditSrc).toMatch(/:src="resolveAssetUrl\(editing\.props\[f\.key\]\)"/);
    // 两个文件都须引入 resolveAssetUrl（单一事实来源 design.js，勿各自内联拼接）
    expect(cardCompItemSrc).toMatch(/import \{ resolveAssetUrl \} from '\.\.\/utils\/design\.js'/);
    expect(cardEditSrc).toMatch(/import \{ useDesignTheme, resolveAssetUrl \} from '\.\.\/\.\.\/utils\/design\.js'/);
  });

  test('H5 上传：chooseMedia 的 File 一并传给上传器（H5 的 uni.uploadFile 对 blob URL 无效）', () => {
    expect(cardEditSrc).toMatch(/cardApi\.uploadUserAvatar\(f\.tempFilePath, f\.file\)/);
  });
});

describe('装修 V1.1 增强（默认值 / 隐藏开关 / 页内预览）', () => {
  test('新组件默认值：上边距 6、圆角 6（两端 toEqual 已钉一致，这里钉业务值）', () => {
    expect(compDefaultProps('image').marginTop).toBe(6);
    expect(compDefaultProps('image').radius).toBe(6);
    expect(compDefaultProps('button').marginTop).toBe(6);
    expect(compDefaultProps('button').radius).toBe(6);
    expect(compDefaultProps('notice').marginTop).toBe(6);
    expect(compDefaultProps('notice').radiusTop).toBe(6);
    expect(compDefaultProps('notice').radiusBottom).toBe(6);
    expect(compDefaultProps('rich-text').marginTop).toBe(6);
    expect(compDefaultProps('rich-text').radiusTop).toBe(6);
    expect(compDefaultProps('divider').marginTop).toBe(6);
  });

  test('显示/隐藏开关：hidden 存 props，列表可切换，cardDetail 渲染过滤', () => {
    expect(cardEditSrc).toMatch(/function toggleHide\(c\)/);
    // .stop：操作条在卡片内，冒泡会让「点隐藏」顺带触发卡片 openEdit（卡片已有点进配置的绑定）
    expect(cardEditSrc).toMatch(/@click\.stop="toggleHide\(c\)"/);
    expect(cardEditSrc).toMatch(/c\.props && c\.props\.hidden \? '显示' : '隐藏'/);
    expect(cardDetailSrc).toMatch(
      /const shownComps = computed\(\(\) => cardComps\.value\.filter\(\(c\) => !\(c\.props && c\.props\.hidden\)\)\)/
    );
    expect(cardDetailSrc).toMatch(/v-for="\(c, i\) in shownComps"/);
  });

  test('操作条 = 主色浮条（1:1 对齐设计中心 .pe-comp-tools）：序号+组件名+图标，浮在卡片右上角', () => {
    // 主色底 + 小圆角（PC 是 6px 圆角，不是胶囊）
    expect(cardEditSrc).toMatch(/\.ce-tools \{[^}]*background: var\(--design-primary\)/);
    expect(cardEditSrc).toMatch(/\.ce-tools \{[^}]*border-radius: var\(--radius-sm\)/);
    // 序号徽标：PC 边条同款（半透明白底）
    expect(cardEditSrc).toMatch(/class="ce-tools-idx"/);
    expect(cardEditSrc).toMatch(/\.ce-tools-idx \{[^}]*background: rgba\(255,255,255,\.25\)/);
    // 🔴 组件名在浮条里（PC 的 .pe-comp-type）：不再有独立标题行，
    //    少占一行 = 渲染区更大 = 所见即所得
    expect(cardEditSrc).toMatch(/class="ce-tools-name">\{\{ nameOf\(c\.type\) \}\}/);
    expect(cardEditSrc).not.toMatch(/class="ce-head"/);
    expect(cardEditSrc).not.toMatch(/class="ce-name"/);
  });

  test('操作条是绝对定位浮层：不另占空间，渲染区不会被推走（真所见即所得）', () => {
    expect(cardEditSrc).toMatch(/\.ce-tools \{[^}]*position: absolute/);
    // 定位基准是 .ce-card（.ce-render 有 overflow:hidden 会裁掉浮条）
    expect(cardEditSrc).toMatch(/\.ce-card \{[\s\S]*?position: relative/);
    // 只覆盖右上角，不全宽铺顶
    expect(cardEditSrc).toMatch(/\.ce-tools \{[^}]*right: var\(--space-r1\)/);
  });

  test('操作条紧凑：整条 ≤ 48rpx（PC 量级），不是上一版 84rpx 的大胶囊', () => {
    expect(cardEditSrc).toMatch(/\.ce-tool \{[^}]*height: 40rpx/);
    // 图标 26rpx、文字 fs-2，与 PC 的 18px 图标/11px 字同量级
    expect(cardEditSrc).toMatch(/\.ce-tool-ico \{[^}]*font-size: 26rpx/);
    expect(cardEditSrc).not.toMatch(/\.ce-tool \{[^}]*height: 64rpx/);
  });

  test('操作条选中才浮现（hover 的手机等价物）：v-if activeKey + 点选进配置', () => {
    expect(cardEditSrc).toMatch(/<view v-if="activeKey === c\.key" class="ce-tools"/);
    expect(cardEditSrc).toMatch(/const activeKey = ref\(null\)/);
    expect(cardEditSrc).toMatch(/function tapCard\(c\)/);
    // 渲染区绑 tapCard：点一下选中，再点一次才进配置
    expect(cardEditSrc).toMatch(/@click="tapCard\(c\)"/);
    expect(cardEditSrc).toMatch(/if \(activeKey\.value === c\.key\) \{ openEdit\(c\); return; \}/);
    // 选中态有描边反馈（对齐 PC .pe-comp.active）——但画在独立的 .ce-ring 上，
    // 不画卡片边框：边框会各占 0.5px 把组件捏窄，破坏与真实页的像素对齐
    expect(cardEditSrc).toMatch(/<view v-if="activeKey === c\.key" class="ce-ring"><\/view>/);
    expect(cardEditSrc).toMatch(/\.ce-ring \{[\s\S]*?border: 1rpx solid var\(--design-primary\)/);
    expect(cardEditSrc).toMatch(/\.ce-ring \{[\s\S]*?pointer-events: none/);
    expect(cardEditSrc).not.toMatch(/\.ce-card \{[^}]*border:/);
    // 胶囊条/文字按钮那套旧类名必须清零
    expect(cardEditSrc).not.toMatch(/class="ce-bar-wrap"/);
    expect(cardEditSrc).not.toMatch(/class="ce-bar"/);
    expect(cardEditSrc).not.toMatch(/上移<\/text>/);
    expect(cardEditSrc).not.toMatch(/下移<\/text>/);
  });

  test('选中态跟着组件走：新增/复制后选中新项，删掉选中项则清空', () => {
    // add：push 后 activeKey = 新项
    expect(cardEditSrc).toMatch(/comps\.value\.push\(item\);[\s\S]*?activeKey\.value = item\.key/);
    // dup：插入后 activeKey = 新项（对齐 PC dupComp 后 selected = 新组件）
    expect(cardEditSrc).toMatch(/arr\.splice\(i \+ 1, 0, item\);[\s\S]*?activeKey\.value = item\.key/);
    // remove：删的正是选中项时清掉，否则浮条会挂在一个已不存在的 key 上
    expect(cardEditSrc).toMatch(/if \(activeKey\.value === c\.key\) activeKey\.value = null;/);
  });

  test('复制：dup 插到原组件后面、props 深拷贝、母版禁复制、受 COMP_MAX 约束', () => {
    expect(cardEditSrc).toMatch(/function dup\(i, c\)/);
    expect(cardEditSrc).toMatch(/if \(c\.isLock\) return;/);
    expect(cardEditSrc).toMatch(/if \(mine\.value\.length >= COMP_MAX\)/);
    expect(cardEditSrc).toMatch(/props: JSON\.parse\(JSON\.stringify\(c\.props \|\| \{\}\)\)/);
    expect(cardEditSrc).toMatch(/arr\.splice\(i \+ 1, 0, item\)/);
  });

  test('复制图标不用 U+29C9 双联方框字符，也不用伪元素（MP 字体豆腐块 / WXSS 伪元素不可靠）', () => {
    // 🔴 断言的是**码点**而不是字面量：写字面量会连本测试文件自己的注释一起命中（假阴性），
    //    而且注释里留着字形，后人复制回代码就前功尽弃。
    expect(cardEditSrc).not.toContain('\u29C9');
    expect(cardEditSrc).not.toMatch(/\.ce-dup-[bf]:{1,2}(before|after)/);
    // 用两个真实 view 叠出，前块背景 = 胶囊底色才能遮出 L 形边
    expect(cardEditSrc).toMatch(/class="ce-dup-b"/);
    expect(cardEditSrc).toMatch(/class="ce-dup-f"/);
    expect(cardEditSrc).toMatch(/\.ce-dup-f \{[^}]*background: var\(--design-primary\)/);
  });

  test('组件几何与真实名片页逐像素一致：左右 28rpx + 间距只由组件 marginTop 决定', () => {
    // 用户报「设计和预览差距还是有点大，主要是组件与组件的间隔」。
    // headless 实测（375px 视口）定位到病根不是某个值偏大，而是**外壳层叠**：
    //   真实页 .cc-list{margin:0 28rpx} + 组件 marginTop(默认6px)      → 间距 6px
    //   旧编辑器 .ce-card{padding:4px; margin-bottom:6px} 架在中间      → 间距 20px
    //   旧预览   .ce-preview-canvas 左右 24rpx（比真实页窄 2px/侧）      → 组件宽 4px
    // 修法：ce-body 左右写 28rpx（补偿卡片原 4px padding），ce-card 零 padding 零 margin-bottom，
    //      预览画布左右也 28rpx。三场景（编辑器/预览/真实页）x/width/gap 全等。
    expect(cardDetailSrc).toMatch(/\.cc-list \{[\s\S]*?margin: 0 28rpx/);
    // 编辑器：左右留白 28rpx（不再靠 body+card 两层拼）
    expect(cardEditSrc).toMatch(/\.ce-body \{ padding: var\(--space-r5\) 28rpx 160rpx; \}/);
    // 卡片零 padding 零 margin-bottom：间距 100% 来自组件自身 marginTop
    expect(cardEditSrc).not.toMatch(/\.ce-card \{[^}]*padding:/);
    expect(cardEditSrc).not.toMatch(/\.ce-card \{[^}]*margin-bottom:/);
    // 卡片无底色、无边框（选中框在独立的 .ce-ring 上，不占布局）
    expect(cardEditSrc).not.toMatch(/\.ce-card \{\s*background: var\(--white\)/);
    expect(cardEditSrc).not.toMatch(/\.ce-card \{[^}]*border:/);
    // 渲染区自身不再带内外距/底色/圆角——那才是"盒子感"的来源
    const renderRule = cardEditSrc.slice(
      cardEditSrc.indexOf('.ce-render {'),
      cardEditSrc.indexOf('.ce-render {') + 200
    );
    expect(renderRule).not.toMatch(/padding:|margin:|background:|border-radius/);
    // 预览画布左右同为 28rpx：预览 = 真实页宽（旧值 space-r5=24rpx 会让组件宽 4px）
    expect(cardEditSrc).toMatch(/\.ce-preview-canvas \{ padding: var\(--space-r2\) 28rpx var\(--space-r6\); \}/);
    // 预览列表项不另加间距（间距同样只由组件 marginTop 决定）
    expect(cardEditSrc).toMatch(/\.pv-item \{ width: 100%; \}/);
  });

  test('配置弹窗按 section 分组：内容段展开、样式段默认折叠', () => {
    expect(cardEditSrc).toMatch(/const editFields = computed/);
    expect(cardEditSrc).toMatch(/__toggle/);
    expect(cardEditSrc).toMatch(/styleOpen\.value = false; \/\/ 每次打开默认收起样式段/);
  });

  test('页内预览：预览按钮 + 全屏层 + 过滤隐藏组件（不用退出到名片详情）', () => {
    expect(cardEditSrc).toMatch(/@click="openPreview"/);
    expect(cardEditSrc).toMatch(
      /const previewComps = computed\(\(\) => comps\.value\.filter\(\(c\) => !\(c\.props && c\.props\.hidden\)\)\)/
    );
    expect(cardEditSrc).toContain('class="ce-preview-layer"');
    // 渲染不再写在本页：预览/列表/详情页共用 CardCompItem（消毒等契约见该组件的 describe）
  });

  test('预览层可用性：custom nav 避让 + 返回入口 + 物理返回键拦截 + 滚动区定高', () => {
    // 头部避让：状态栏占位 + 胶囊右侧避让必须 JS 实测内联（写死百分比真机必压）
    expect(cardEditSrc).toMatch(/import \{ getNavMetrics \} from '\.\.\/\.\.\/utils\/navMetrics\.js'/);
    expect(cardEditSrc).toMatch(/const pvHeadStyle = \{ paddingTop: navM\.statusBarHeight \+ 'px', paddingRight: navM\.capsuleRightPad \+ 'px' \}/);
    expect(cardEditSrc).toMatch(/:style="pvHeadStyle"/);
    // 返回入口双保险：左上「‹ 返回」+ 右侧「完成」
    expect(cardEditSrc).toMatch(/class="ce-preview-back" @click="closePreview"/);
    expect(cardEditSrc).toMatch(/class="ce-preview-done" @click="closePreview"/);
    // Android 物理返回/侧滑：先关预览层，不直接丢掉未保存修改退页
    expect(cardEditSrc).toMatch(/import \{ onBackPress \} from '@dcloudio\/uni-app'/);
    expect(cardEditSrc).toMatch(/onBackPress\(\(\) => \{/);
    expect(cardEditSrc).toMatch(/if \(showPreview\.value\) \{ showPreview\.value = false; return true; \}/);
    // MP 滚动区显式定高（flex:1+min-height:0 在 MP 无效，同弹窗 46vh 的坑）
    expect(cardEditSrc).toMatch(/height: `calc\(100vh - \$\{navM\.statusBarHeight \+ navM\.navBarHeight\}px\)`/);
    expect(cardEditSrc).toMatch(/:style="pvBodyStyle"/);
  });

  test('预览入口不必滚到列表末尾：导航栏常驻 + 底部吸底双入口', () => {
    // 组件一多，只放在列表最末就得滑到底才能预览（用户反馈）
    expect(cardEditSrc).toMatch(/<PageNav title="装修我的名片" back>/);
    expect(cardEditSrc).toMatch(/<template #right>\s*\n\s*<text class="ce-nav-preview" @click="openPreview">预览<\/text>/);
    // 底部入口改为吸底（包裹层自带底色，防止列表内容从按钮两侧透出）
    expect(cardEditSrc).toMatch(/class="ce-preview-bar-wrap"/);
    expect(cardEditSrc).toMatch(/\.ce-preview-bar-wrap \{[\s\S]*?position: sticky;/);
    expect(cardEditSrc).toMatch(/\.ce-preview-bar-wrap \{[\s\S]*?bottom: 0;/);
    expect(cardEditSrc).toMatch(/\.ce-preview-bar-wrap \{[\s\S]*?background: var\(--bg-page\);/);
  });

  test('预览/列表渲染走共享组件：结构与详情页一致 + 图片失败占位', () => {
    // 🔴 #321：文本组件原来写死一个 .cc-notice-dot 圆点（用户输入文字后左边凭空多个点），
    //   改成按 symbol 配置渲染、默认无符号。钉「旧圆点已移除 + 新符号受配置控制」。
    expect(cardCompItemSrc).not.toContain('cc-notice-dot');
    expect(cardCompItemSrc).toMatch(/class="cc-notice-sym"/);
    expect(cardCompItemSrc).toMatch(/noticeSymbolShape/);
    expect(cardCompItemSrc).toMatch(/class="cc-img-fallback"/);
    expect(cardCompItemSrc).toMatch(/@error="imgFailed = true"/);
    // divider 单线 + 右侧文字（早期预览层写成双线，是漂移的典型案例）
    expect(cardCompItemSrc).toMatch(/class="cc-divider-line"/);
    expect(cardCompItemSrc).toMatch(/class="cc-divider-text"/);
    expect(cardCompItemSrc).not.toMatch(/v-if="c\.props\.text" class="cc-divider-line"/);
  });
});
